import { loadSearchBatch } from './db.js'
import { matchSession, searchTerms } from './searchText.js'
import type { ChatSearchRequest, ChatSearchResponse, ChatSearchResult } from './searchProtocol.js'

// No DOM, localStorage or native bridge dependency is loaded in this worker.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ChatSearchRequest>) => void) | null
  postMessage: (message: ChatSearchResponse) => void
}
let latestId = 0
scope.onmessage = ({ data }) => {
  latestId = data.id
  void search(data)
}

const search = async ({ id, query, sessionIds, defaultTitle, limit }: ChatSearchRequest) => {
  const results: ChatSearchResult[] = []
  const terms = searchTerms(query)
  let total = 0
  try {
    for (let start = 0; start < sessionIds.length; start += 16) {
      const sessions = await loadSearchBatch(sessionIds.slice(start, start + 16))
      if (latestId !== id) {
        return
      }
      for (const session of sessions) {
        if (!session) {
          continue
        }
        const match = matchSession(session, terms, defaultTitle)
        if (match) {
          total++
          if (results.length < limit) {
            results.push(match)
          }
        }
      }
    }
    if (latestId === id) {
      scope.postMessage({ id, results, total })
    }
  } catch {
    if (latestId === id) {
      scope.postMessage({ id, results: [], total: 0, error: true })
    }
  }
}
