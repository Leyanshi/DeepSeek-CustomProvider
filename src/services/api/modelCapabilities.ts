export type ModelCapabilities = { thinking?: boolean; effort?: boolean }
type ModelInfo = ModelCapabilities & { id: string }
const STORAGE_KEY = 'chat-demo:model-capabilities'
const CACHE_LIMIT = 128
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readCache = (): Map<string, ModelCapabilities> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) {
      return new Map(
        saved
          .filter(
            (item): item is [string, ModelCapabilities] =>
              Array.isArray(item) &&
              typeof item[0] === 'string' &&
              record(item[1]) &&
              (item[1].thinking === undefined || typeof item[1].thinking === 'boolean') &&
              (item[1].effort === undefined || typeof item[1].effort === 'boolean')
          )
          .slice(-CACHE_LIMIT)
      )
    }
  } catch {
    /* Storage unavailable or corrupt. */
  }
  return new Map()
}
const cache = readCache()
let generation = 0
export const modelCapabilitiesGeneration = () => generation
const saveCache = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...cache]))
  } catch {
    /* Memory cache still works. */
  }
}

/** A new key can route the same URL/model to a different backend. Invalidate old observations. */
export const resetModelCapabilities = (baseUrl?: string, model?: string) => {
  generation++
  if (baseUrl && model) {
    cache.delete(key(baseUrl, model))
  } else {
    cache.clear()
  }
  saveCache()
}
const key = (baseUrl: string, model: string) => JSON.stringify([baseUrl.replace(/\/+$/, ''), model])
const remember = (baseUrl: string, model: string, capabilities: ModelCapabilities) => {
  const id = key(baseUrl, model)
  cache.set(id, { ...cache.get(id), ...capabilities })
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) {
      cache.delete(oldest)
    }
  }
  saveCache()
}

export const rememberModelCapabilities = (
  baseUrl: string,
  models: ModelInfo[],
  requestGeneration = generation
) => {
  if (requestGeneration !== generation) {
    return
  }
  for (const { id, thinking, effort } of models) {
    if (thinking !== undefined || effort !== undefined) {
      remember(baseUrl, id, {
        ...(thinking === undefined ? {} : { thinking }),
        ...(effort === undefined ? {} : { effort }),
      })
    }
  }
}

export const removeUnsupportedThinking = <
  T extends {
    model: string
    thinking?: unknown
    output_config?: { effort?: unknown }
  },
>(
  body: T,
  capabilities?: ModelCapabilities
): T => {
  const result = { ...body }
  if (capabilities?.thinking === false) {
    delete result.thinking
  }
  if (capabilities?.thinking === false || capabilities?.effort === false) {
    if (result.output_config) {
      result.output_config = { ...result.output_config }
      delete result.output_config.effort
      if (Object.keys(result.output_config).length === 0) {
        delete result.output_config
      }
    }
  }
  return result
}

export const withoutUnsupportedThinking = <
  T extends {
    model: string
    thinking?: unknown
    output_config?: { effort?: unknown }
  },
>(
  baseUrl: string,
  body: T
): T => removeUnsupportedThinking(body, cache.get(key(baseUrl, body.model)))

/** Avoid downgrading for auth, rate limits, invalid budgets, or failures after output starts. */
export const detectUnsupportedThinking = (error: {
  status?: number
  message: string
  parameter?: string
}): ModelCapabilities => {
  if (
    ![400, 422].includes(error.status ?? 0) ||
    !/unsupported|not\s+supported|does\s+not\s+support|not\s+allowed|unknown\s+(?:field|parameter|argument)|unrecognized|unexpected|extra\s+(?:inputs|fields)|extra_forbidden|不支持|不允许|未知参数/i.test(
      error.message
    )
  ) {
    return {}
  }
  const evidence = `${error.parameter ?? ''} ${error.message}`
  const effort = /reasoning_effort|output_config|\beffort\b/i.test(evidence)
  const thinking = /\bthinking\b/i.test(evidence) || (!effort && /\breasoning\b/i.test(evidence))
  return { ...(thinking ? { thinking: false } : {}), ...(effort ? { effort: false } : {}) }
}

export const rememberUnsupportedThinking = (
  baseUrl: string,
  model: string,
  capabilities: ModelCapabilities,
  requestGeneration = generation
) => {
  if (requestGeneration === generation) {
    remember(baseUrl, model, capabilities)
  }
}
