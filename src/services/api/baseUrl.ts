/** Validate and normalize a service root or an existing /v1 API prefix. */
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'

export const normalizeBaseUrl = (value: string): string => {
  const input = value.trim()
  const url = new URL(input)
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\\?#]/.test(input) ||
    /%(?:2f|5c|00)/i.test(url.pathname)
  ) {
    throw new Error('Invalid Base URL')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Avoid duplicating /v1 when the configured URL already contains an API prefix. */
export const resolveApiUrl = (baseUrl: string, endpoint: string): string => {
  const base = normalizeBaseUrl(baseUrl)
  if (base.endsWith('/v1') && endpoint.startsWith('/anthropic/v1/')) {
    return base + endpoint.slice('/anthropic/v1'.length)
  }
  if (endpoint.startsWith('/v1/tools/') || endpoint.startsWith('/v1/audio/')) {
    if (base.endsWith('/anthropic/v1')) {
      return base.slice(0, -'/anthropic/v1'.length) + endpoint
    }
    if (base.endsWith('/v1')) {
      return base + endpoint.slice('/v1'.length)
    }
  }
  return base + endpoint
}
