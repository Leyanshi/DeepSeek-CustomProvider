import { normalizeBaseUrl } from './baseUrl.js'
import { normalizeModelId } from './models.js'

export type WebProvider = 'deepseek' | 'grok'

export const DEFAULT_GROK_MCP_URL = 'https://mcp.episkeyai.com/groksearch_rs/mcp'

export const defaultGrokSearchConfig = () => ({
  endpoint: DEFAULT_GROK_MCP_URL,
  apiKey: '',
  baseUrl: '',
  model: '',
  mcpApiKey: '',
  tavilyApiKey: '',
  exaApiKey: '',
  tinyfishApiKey: '',
  firecrawlApiKey: '',
  githubToken: '',
})

export type GrokSearchConfig = ReturnType<typeof defaultGrokSearchConfig>

/** Remote MCP credentials are independent of the chat connection. */
export const normalizeGrokSearchConfig = (value: unknown): GrokSearchConfig => {
  const config = defaultGrokSearchConfig()
  if (typeof value !== 'object' || value === null) {
    return config
  }
  for (const key of Object.keys(config) as (keyof GrokSearchConfig)[]) {
    const raw = (value as Record<string, unknown>)[key]
    if (typeof raw === 'string') {
      const field = raw.trim()
      if (field.length > 8192 || /[\p{Cc}]/u.test(field)) {
        throw new Error('Invalid GrokSearch setting')
      }
      config[key] = field
    }
  }
  config.endpoint = normalizeBaseUrl(config.endpoint || DEFAULT_GROK_MCP_URL)
  config.baseUrl = config.baseUrl ? normalizeBaseUrl(config.baseUrl) : ''
  config.model = config.model ? normalizeModelId(config.model) : ''
  return config
}

export const grokSearchHeaders = (config: GrokSearchConfig): Record<string, string> => {
  const headers: Record<string, string> = {}
  const fields: [keyof GrokSearchConfig, string][] = [
    ['apiKey', 'X-Grok-Api-Key'],
    ['baseUrl', 'X-Grok-Base-Url'],
    ['model', 'X-Grok-Model'],
    ['tavilyApiKey', 'X-Tavily-Api-Key'],
    ['exaApiKey', 'X-Exa-Api-Key'],
    ['tinyfishApiKey', 'X-Tinyfish-Api-Key'],
    ['firecrawlApiKey', 'X-Firecrawl-Api-Key'],
    ['githubToken', 'X-GitHub-Token'],
  ]
  for (const [key, header] of fields) {
    if (config[key]) {
      headers[header] = config[key]
    }
  }
  if (config.mcpApiKey) {
    headers.Authorization = `Bearer ${config.mcpApiKey}`
  }
  return headers
}
