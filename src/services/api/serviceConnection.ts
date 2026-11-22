import { normalizeBaseUrl } from './baseUrl.js'

/** Empty fields follow the chat connection, unless an independent service URL is entered. */
export type ServiceConnection = { baseUrl: string; apiKey: string }
export const EMPTY_SERVICE: ServiceConnection = { baseUrl: '', apiKey: '' }

export const normalizeServiceConnection = (value: ServiceConnection): ServiceConnection => ({
  baseUrl: value.baseUrl.trim() ? normalizeBaseUrl(value.baseUrl) : '',
  apiKey: value.apiKey.trim(),
})

export const resolveServiceConnection = (
  value: ServiceConnection,
  chat: { baseUrl: string; apiKey: string | null }
): { baseUrl: string; apiKey: string } => ({
  baseUrl: value.baseUrl || chat.baseUrl,
  // An independent URL must have its own key; never forward the chat key to another provider.
  apiKey: value.apiKey || (value.baseUrl ? '' : (chat.apiKey ?? '')),
})
