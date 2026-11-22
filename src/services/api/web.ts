import { createId } from '../../utils/id.js'
import { useSettings } from '../settings.js'
import { ApiError, request } from './client.js'
import { resolveServiceConnection } from './serviceConnection.js'
import type { ServerToolBlock, ServerToolUseBlock, WebSearchResult } from './types.js'
import { webContextText } from './webContext.js'
import { createGrokSearchClient } from './grokSearch.js'
import { grokFetchOutput, grokSearchOutput } from './grokSearchProtocol.js'
import type { ServiceConnection } from './serviceConnection.js'

type SearchResult = WebSearchResult & { summary: string; content: string }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const nullable = (value: unknown): string | null => text(value) || null
const limit = (value: string, count: number) => Array.from(value).slice(0, count).join('')

export const validWebUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export const parseSearchResults = (body: unknown): SearchResult[] => {
  if (!record(body) || !Array.isArray(body.results)) {
    throw new ApiError('protocol', 'Invalid Search API response')
  }
  const seen = new Set<string>()
  return body.results
    .flatMap((item): SearchResult[] => {
      if (
        !record(item) ||
        typeof item.url !== 'string' ||
        !validWebUrl(item.url) ||
        seen.has(item.url)
      ) {
        return []
      }
      seen.add(item.url)
      return [
        {
          type: 'web_search_result',
          url: item.url,
          title: text(item.title) || item.url,
          snippet: limit(text(item.summary) || text(item.snippet) || text(item.content), 5000),
          summary: text(item.summary),
          content: text(item.content),
          site_icon: nullable(item.site_icon),
          site_name: nullable(item.site_name),
          page_age: nullable(item.date),
          encrypted_content: '',
        },
      ]
    })
    .slice(0, 10)
}

const webRequest = async (
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
  connection: ServiceConnection
): Promise<unknown> => {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.throwIfAborted()
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      connection.baseUrl
    )
    return await response.json()
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

const tool = (
  input: ServerToolUseBlock['input'],
  kind: 'search' | 'deep_search' | 'read_link'
): ServerToolUseBlock => ({
  type: 'server_tool_use',
  id: `local_web_${createId()}`,
  name: kind === 'read_link' ? 'deepseek_read_url' : 'deepseek_web_search',
  caller: { type: 'direct' },
  input,
  kind,
})

/** Call Search/Fetch ourselves so a chat provider need not implement built-in web tools. */
export const prepareWebContext = async (
  question: string,
  search: boolean,
  signal: AbortSignal,
  onBlocks: (blocks: ServerToolBlock[]) => void
): Promise<{ blocks: ServerToolBlock[]; context: string }> => {
  const settings = useSettings.getState()
  const connection = resolveServiceConnection(settings.webService, settings)
  const grok =
    settings.webProvider === 'grok' ? createGrokSearchClient(settings.grokSearch, signal) : null
  let searchSummary = ''
  const blocks: ServerToolBlock[] = []
  const publish = () => onBlocks([...blocks])
  const pages = new Map<string, 'read_link' | 'deep_search'>()
  for (const url of question.match(/https?:\/\/[^\s<>"\u3000]+/g) ?? []) {
    const cleaned = url.replace(/[)\].,;!?，。；！？）】]+$/, '')
    if (validWebUrl(cleaned) && cleaned.length <= 8192 && pages.size < 3) {
      pages.set(cleaned, 'read_link')
    }
  }
  if (search && question.trim()) {
    const query = limit(question.trim(), grok ? 8000 : 128)
    const call = tool({ action: 'search', query, queries: [query] }, 'search')
    blocks.push(call)
    publish()
    try {
      let body: unknown
      if (grok) {
        const output = grokSearchOutput(
          await grok.call('web_search', { query, response_format: 'concise' })
        )
        body = output
        searchSummary = limit(output.summary, 24000)
      } else {
        body = await webRequest(
          '/v1/tools/search',
          {
            query,
            count: 10,
            ori_question: query,
            need_content: false,
          },
          signal,
          connection
        )
      }
      const results = parseSearchResults(body)
      blocks.push({
        type: 'web_search_tool_result',
        tool_use_id: call.id,
        kind: 'search',
        content: results,
      })
      if (settings.webFetch) {
        for (const result of results.slice(0, 2)) {
          if (!pages.has(result.url) && pages.size < 3) {
            pages.set(result.url, 'deep_search')
          }
        }
      }
    } catch {
      signal.throwIfAborted()
      blocks.push({
        type: 'web_search_tool_result',
        tool_use_id: call.id,
        kind: 'search',
        content: [{ type: 'web_search_tool_result_error', error_code: 'unavailable' }],
      })
    }
    publish()
  }
  if (settings.webFetch) {
    await Promise.all(
      [...pages].map(async ([url, kind]) => {
        const call = tool({ action: kind === 'read_link' ? 'read_link' : 'open_page', url }, kind)
        blocks.push(call)
        publish()
        try {
          const page = grok
            ? grokFetchOutput(await grok.call('web_fetch', { url, max_chars: 24000 }), url)
            : await webRequest('/v1/tools/fetch', { url }, signal, connection)
          if (!record(page) || typeof page.content !== 'string' || typeof page.title !== 'string') {
            throw new ApiError('protocol', 'Invalid Fetch API response')
          }
          blocks.push({
            type: 'web_fetch_tool_result',
            tool_use_id: call.id,
            kind,
            content: {
              type: 'web_fetch_result',
              url,
              published_at: null,
              content: {
                type: 'document',
                title: page.title,
                source: {
                  type: 'text',
                  media_type: 'text/plain',
                  data: limit(page.content, 24000),
                },
              },
            },
          })
        } catch {
          signal.throwIfAborted()
          blocks.push({
            type: 'web_fetch_tool_result',
            tool_use_id: call.id,
            kind,
            content: {
              type: 'web_fetch_tool_result_error',
              error_code: 'unavailable',
            },
          })
        }
        publish()
      })
    )
  }
  signal.throwIfAborted()
  return { blocks, context: webContextText(blocks, searchSummary) }
}
