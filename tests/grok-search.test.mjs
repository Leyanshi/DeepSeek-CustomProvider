import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  grokFetchOutput,
  grokSearchOutput,
  grokToolResult,
  rpcResult,
} from '../src/services/api/grokSearchProtocol.ts'

test('requires a JSON-RPC result for the corresponding request', () => {
  assert.deepEqual(
    rpcResult({ jsonrpc: '2.0', id: 'search-1', result: { ok: true } }, 'search-1'),
    { ok: true }
  )
  for (const value of [
    null,
    [],
    { id: 'search-1', result: {} },
    { jsonrpc: '2.0', id: 'search-2', result: {} },
    { jsonrpc: '2.0', id: 'search-1' },
  ]) {
    assert.throws(() => rpcResult(value, 'search-1'))
  }
  assert.throws(
    () =>
      rpcResult(
        { jsonrpc: '2.0', id: 'search-1', error: { code: -32603, message: 'Gateway unavailable' } },
        'search-1'
      ),
    /Gateway unavailable/
  )
})

test('reads structured MCP tool content and legacy text JSON envelopes', () => {
  const output = { content: '整理摘要', sources: [] }
  assert.deepEqual(
    grokToolResult({ structuredContent: output, content: [{ type: 'text', text: 'ignored' }] }),
    output
  )
  assert.deepEqual(
    grokToolResult({
      content: [
        { type: 'image', data: 'ignore' },
        { type: 'text', text: 'status' },
        { type: 'text', text: JSON.stringify(output) },
      ],
    }),
    output
  )
})

test('rejects tool failures even if a structured payload is present', () => {
  for (const value of [
    null,
    {},
    { content: [{ type: 'text', text: '[]' }] },
    { content: [{ type: 'text', text: 'Bad Key' }] },
    { isError: true, structuredContent: { content: 'do not use' } },
  ]) {
    assert.throws(() => grokToolResult(value))
  }
})

test('preserves the Grok answer, source descriptions, dates and inline content', () => {
  const result = grokSearchOutput({
    content: '联网服务整理的回答',
    sources: [
      null,
      {
        url: 'https://a.example',
        title: '资料一',
        provider: 'grok',
        description: '摘要',
        published_date: '2026-11-22',
      },
      { url: 'https://b.example', description: '短摘要', content: '完整正文' },
    ],
  })
  assert.equal(result.summary, '联网服务整理的回答')
  assert.equal(result.results.length, 2)
  assert.equal(result.results[0].summary, '摘要')
  assert.equal(result.results[0].date, '2026-11-22')
  assert.equal(result.results[1].summary, '完整正文')
})

test('keeps an answer with zero sources without inventing a source', () => {
  assert.deepEqual(grokSearchOutput({ content: 'No reliable citations', sources: [] }), {
    summary: 'No reliable citations',
    results: [],
  })
  assert.throws(() => grokSearchOutput({ content: 'answer' }))
  assert.throws(() => grokSearchOutput({ sources: [] }))
})

test('accepts fetched Markdown without a title and rejects an unrelated URL or empty content', () => {
  const url = 'https://example.com/page'
  assert.deepEqual(
    grokFetchOutput({ url, content: '# Page\n正文', source_type: 'generic', truncated: true }, url),
    { title: url, content: '# Page\n正文' }
  )
  for (const value of [
    { url, content: '' },
    { url, content: ' ' },
    { content: 'text' },
    { url: 'https://other.example', content: 'text' },
  ]) {
    assert.throws(() => grokFetchOutput(value, url))
  }
})
