import type { SessionSummary } from './types.js'

export type ChatSearchResult = SessionSummary & { excerpt: string }
export type ChatSearchRequest = {
  id: number
  query: string
  sessionIds: string[]
  defaultTitle: string
  limit: number
}
export type ChatSearchResponse = {
  id: number
  results: ChatSearchResult[]
  total: number
  error?: boolean
}
