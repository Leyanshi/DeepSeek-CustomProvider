export const DEFAULT_MODEL = 'deepseek-flash'

export type ApiModel = { id: string; name: string }

export const normalizeModelId = (value: string): string => {
  const id = value.trim()
  if (!id || id.length > 256 || /[\s\p{Cc}]/u.test(id)) {
    throw new Error('Invalid model ID')
  }
  return id
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
      models.set(id, { id, name: label || id })
    }
  }
  return [...models.values()]
}
