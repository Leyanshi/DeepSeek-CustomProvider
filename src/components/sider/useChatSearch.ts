import { useEffect, useRef, useState } from 'react'
import { subscribeSearchChanges } from '../../services/chat/db.js'
import type { SessionSummary } from '../../services/chat/types.js'
import type { ChatSearchResponse, ChatSearchResult } from '../../services/chat/searchProtocol.js'

type SearchState = { results: ChatSearchResult[]; total: number; pending: boolean; error: boolean }
const empty = { results: [], total: 0, pending: false, error: false }
const createSearchWorker = () =>
  new Worker(new URL('../../services/chat/search.worker.ts', import.meta.url), {
    name: 'chat-search',
  })

/** Two dedicated workers perform all history reads and text matching, with debounced latest-query results. */
export const useChatSearch = (query: string, sessions: SessionSummary[], defaultTitle: string) => {
  const [state, setState] = useState<SearchState>(empty)
  const [revision, setRevision] = useState(0)
  const [limit, setLimit] = useState(50)
  const workers = useRef<Worker[]>([])
  const sequence = useRef(0)
  const previousQuery = useRef('')
  const active = Boolean(query.trim())

  useEffect(() => {
    if (!active) {
      return
    }
    return subscribeSearchChanges(() => setRevision((value) => value + 1))
  }, [active])

  useEffect(() => {
    return () => {
      workers.current.forEach((worker) => worker.terminate())
      workers.current = []
    }
  }, [active])

  useEffect(() => {
    setLimit(50)
  }, [query])

  useEffect(() => {
    const id = ++sequence.current
    let cancelled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    if (!active) {
      setState(empty)
      return
    }
    const changedQuery = previousQuery.current !== query
    previousQuery.current = query
    setState((previous) => ({ ...(changedQuery ? empty : previous), pending: true, error: false }))
    const timer = setTimeout(() => {
      const replies = new Map<number, ChatSearchResponse>()
      const fail = () => {
        if (!cancelled && sequence.current === id) {
          clearTimeout(watchdog)
          workers.current.forEach((worker) => worker.terminate())
          workers.current = []
          setState({ ...empty, error: true })
        }
      }
      watchdog = setTimeout(fail, 60000)
      const shards: string[][] = [[], []]
      sessions.forEach((session, index) => shards[index % 2].push(session.id))
      try {
        if (workers.current.length === 0) {
          // Classic workers work on older WebViews; all scripts are bundled local assets.
          workers.current.push(createSearchWorker())
          workers.current.push(createSearchWorker())
        }
      } catch {
        fail()
        return
      }
      workers.current.forEach((worker, index) => {
        worker.onerror = fail
        worker.onmessageerror = fail
        worker.onmessage = ({ data }: MessageEvent<ChatSearchResponse>) => {
          if (cancelled || data.id !== id || sequence.current !== id) {
            return
          }
          if (data.error) {
            fail()
            return
          }
          replies.set(index, data)
          if (replies.size === 2) {
            clearTimeout(watchdog)
            const all = [...replies.values()]
            setState({
              results: all
                .flatMap((reply) => reply.results)
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, limit),
              total: all.reduce((count, reply) => count + reply.total, 0),
              pending: false,
              error: false,
            })
          }
        }
        worker.postMessage({ id, query, sessionIds: shards[index], defaultTitle, limit })
      })
    }, 180)
    return () => {
      clearTimeout(timer)
      clearTimeout(watchdog)
      // Ignore callbacks even during the debounce interval of a new query or after unmount.
      cancelled = true
    }
  }, [active, query, sessions, defaultTitle, revision, limit])

  return {
    ...state,
    active,
    more: () => setLimit((value) => value + 50),
    retry: () => setRevision((value) => value + 1),
  }
}
