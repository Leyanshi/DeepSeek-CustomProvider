import { createId } from '../../utils/id.js'
import { request } from './client.js'
import { grokSearchHeaders, type GrokSearchConfig } from './grokSearchConfig.js'
import { grokToolResult, rpcResult } from './grokSearchProtocol.js'
import { readServerSentEvents } from './sse.js'

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18']

/** One MCP client per chat turn: never reuse a session after URL/key/model changes. */
export const createGrokSearchClient = (config: GrokSearchConfig, signal: AbortSignal) => {
  let protocolVersion = PROTOCOL_VERSIONS[0]
  let sessionId = ''
  let initialized: Promise<void> | undefined

  const send = async (method: string, params?: unknown, notification = false): Promise<unknown> => {
    signal.throwIfAborted()
    const id = createId()
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(), method === 'tools/call' ? 120000 : 20000)
    try {
      const response = await request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            ...grokSearchHeaders(config),
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': protocolVersion,
            ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
          },
          body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
          signal: controller.signal,
        },
        config.endpoint
      )
      if (notification) {
        await response.body?.cancel()
        controller.signal.throwIfAborted()
        return
      }
      if (method === 'initialize') {
        sessionId = response.headers.get('mcp-session-id') ?? ''
      }
      if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
        for await (const event of readServerSentEvents(response.body, controller.signal)) {
          controller.signal.throwIfAborted()
          const value: unknown = JSON.parse(event.data)
          if (typeof value === 'object' && value !== null && 'id' in value && value.id === id) {
            return rpcResult(value, id)
          }
        }
        controller.signal.throwIfAborted()
        throw new Error('MCP stream ended without a response')
      }
      const value: unknown = await response.json()
      controller.signal.throwIfAborted()
      return rpcResult(value, id)
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }

  const initialize = async () => {
    const result = await send('initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'deepseek-customprovider', version: __APP_VERSION__ },
    })
    if (
      typeof result !== 'object' ||
      result === null ||
      !('protocolVersion' in result) ||
      typeof result.protocolVersion !== 'string' ||
      !PROTOCOL_VERSIONS.includes(result.protocolVersion)
    ) {
      throw new Error('Unsupported MCP protocol version')
    }
    protocolVersion = result.protocolVersion
    await send('notifications/initialized', undefined, true)
  }

  return {
    async call(name: 'web_search' | 'web_fetch', args: Record<string, unknown>) {
      initialized ??= initialize()
      await initialized
      signal.throwIfAborted()
      return grokToolResult(await send('tools/call', { name, arguments: args }))
    },
  }
}
