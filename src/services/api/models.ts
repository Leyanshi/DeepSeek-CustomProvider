import type { ModelCapabilities } from './modelCapabilities.js'

export const DEFAULT_MODEL = 'deepseek-flash'

export type ApiModel = { id: string; name: string } & ModelCapabilities

export const normalizeModelId = (value: string): string => {
  const id = value.trim()
  if (!id || id.length > 256 || /[\s\p{Cc}]/u.test(id)) {
    throw new Error('Invalid model ID')
  }
  return id
}

/** Only explicit provider metadata determines capabilities; a custom model name is insufficient. */
export const parseModelCapabilities = (item: Record<string, unknown>): ModelCapabilities => {
  const raw = item.capabilities
  const capabilities =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const firstBoolean = (...values: unknown[]) =>
    values.find((value) => typeof value === 'boolean') as boolean | undefined
  const parameters =
    Array.isArray(item.supported_parameters) &&
    item.supported_parameters.every((value) => typeof value === 'string')
      ? item.supported_parameters
      : undefined
  const thinking = firstBoolean(
    item.supports_thinking,
    capabilities.thinking,
    item.supports_reasoning,
    capabilities.reasoning,
    parameters?.some((value) =>
      ['thinking', 'reasoning', 'reasoning_effort', 'output_config.effort'].includes(value)
    )
  )
  const effort = firstBoolean(
    item.supports_reasoning_effort,
    capabilities.reasoning_effort,
    parameters?.some((value) => ['reasoning_effort', 'output_config.effort'].includes(value))
  )
  return {
    ...(thinking === undefined ? {} : { thinking }),
    ...(effort === undefined ? {} : { effort }),
  }
}

/** Accept standard /models responses; skip invalid items and duplicate IDs. */
export const parseModels = (value: unknown): ApiModel[] => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    !Array.isArray(value.data)
  ) {
    throw new Error('Invalid models response')
  }
  const models = new Map<string, ApiModel>()
  for (const item of value.data) {
    if (typeof item !== 'object' || item === null || typeof item.id !== 'string') {
      continue
    }
    let id: string
    try {
      id = normalizeModelId(item.id)
    } catch {
      continue
    }
    const label = typeof item.display_name === 'string' ? item.display_name.trim() : ''
    if (!models.has(id)) {
      models.set(id, { id, name: label || id, ...parseModelCapabilities(item) })
    }
  }
  return [...models.values()]
}
