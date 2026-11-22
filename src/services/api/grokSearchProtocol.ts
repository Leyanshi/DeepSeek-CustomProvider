const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const rpcResult = (value: unknown, id: string): unknown => {
  if (!record(value) || value.jsonrpc !== '2.0' || value.id !== id) {
    throw new Error('Invalid MCP response or request ID')
  }
  if (record(value.error)) {
    throw new Error(
      typeof value.error.message === 'string' ? value.error.message : 'MCP request failed'
    )
  }
  if (!('result' in value)) {
    throw new Error('Missing MCP result')
  }
  return value.result
}

/** GrokSearch-rs returns structuredContent plus a text JSON compatibility copy. */
export const grokToolResult = (value: unknown): Record<string, unknown> => {
  if (!record(value) || value.isError === true) {
    throw new Error('MCP tool failed')
  }
  if (record(value.structuredContent)) {
    return value.structuredContent
  }
  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      if (record(block) && block.type === 'text' && typeof block.text === 'string') {
        try {
          const parsed: unknown = JSON.parse(block.text)
          if (record(parsed)) {
            return parsed
          }
        } catch {
          /* Other text blocks are not structured tool output. */
        }
      }
    }
  }
  throw new Error('Missing GrokSearch tool output')
}

export const grokSearchOutput = (value: Record<string, unknown>) => {
  if (typeof value.content !== 'string' || !Array.isArray(value.sources)) {
    throw new Error('Invalid GrokSearch search output')
  }
  return {
    summary: value.content,
    results: value.sources.filter(record).map((source) => ({
      url: source.url,
      title: source.title,
      summary: source.content || source.description,
      site_name: source.provider,
      date: source.published_date,
    })),
  }
}

export const grokFetchOutput = (value: Record<string, unknown>, url: string) => {
  if (typeof value.content !== 'string' || !value.content.trim() || value.url !== url) {
    throw new Error('Invalid GrokSearch fetch output')
  }
  return { title: url, content: value.content }
}
