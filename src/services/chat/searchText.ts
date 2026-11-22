import type { Session } from './types.js'
import type { ChatSearchResult } from './searchProtocol.js'

export const normalizeSearchText = (text: string) => text.normalize('NFKC').toLowerCase()
export const searchTerms = (query: string) => [
  ...new Set(normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)),
]

/** Read only human-readable message text, never keys, binary images or encrypted source payloads. */
function* messageText(session: Session): Generator<string> {
  for (const message of session.messages) {
    if (message.role === 'user') {
      yield message.content
    } else {
      for (const block of message.blocks) {
        if (block.type === 'text') {
          yield block.text
        } else if (block.type === 'thinking') {
          yield block.thinking
        } else if (block.type === 'web_search_tool_result') {
          for (const source of block.content) {
            if (source.type === 'web_search_result') {
              yield source.title + '\n' + source.snippet
            }
          }
        } else if (
          block.type === 'web_fetch_tool_result' &&
          block.content.type === 'web_fetch_result'
        ) {
          yield (block.content.content.title ?? '') + '\n' + block.content.content.source.data
        }
      }
    }
  }
}

/** All words must occur somewhere in the title or messages; search every saved branch. */
export const matchSession = (
  session: Session,
  terms: string[],
  defaultTitle: string
): ChatSearchResult | null => {
  const title = normalizeSearchText(session.title || defaultTitle)
  const missing = new Set(terms.filter((term) => !title.includes(term)))
  let excerpt = ''
  for (const text of messageText(session)) {
    const normalized = normalizeSearchText(text)
    const position = Math.min(
      ...terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0)
    )
    if (!excerpt && Number.isFinite(position)) {
      const start = Math.max(0, position - 36)
      const original = text.length === normalized.length ? text : normalized
      excerpt =
        (start ? '…' : '') +
        original.slice(start, start + 140).replace(/\s+/g, ' ') +
        (normalized.length > start + 140 ? '…' : '')
    }
    for (const term of missing) {
      if (normalized.includes(term)) {
        missing.delete(term)
      }
    }
    if (missing.size === 0 && excerpt) {
      break
    }
  }
  const { id, title: originalTitle, createdAt, updatedAt } = session
  return missing.size === 0 ? { id, title: originalTitle, createdAt, updatedAt, excerpt } : null
}
