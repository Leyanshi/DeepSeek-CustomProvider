import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_BASE_URL, normalizeBaseUrl, resolveApiUrl } from '../src/services/api/baseUrl.ts'

test('normalizes HTTPS URLs and rejects ambiguous or credential-bearing inputs', () => {
  assert.equal(
    normalizeBaseUrl(' https://EXAMPLE.com:8443/proxy/v1/// '),
    'https://example.com:8443/proxy/v1'
  )
  for (const value of [
    'http://example.com',
    'example.com',
    'https://user@example.com',
    'https://example.com?key=secret',
    'https://example.com#fragment',
    'https://example.com/a%2fb',
    'https://example.com/a%5cb',
    'https://example.com/%00',
    'https://example.com/a b',
    'https://example.com\\path',
  ]) {
    assert.throws(() => normalizeBaseUrl(value), value)
  }
})

test('uses service prefixes for all endpoints without duplicating /v1', () => {
  const examples = [
    [DEFAULT_BASE_URL, '/models', 'https://api.deepseek.com/models'],
    [DEFAULT_BASE_URL, '/anthropic/v1/messages', 'https://api.deepseek.com/anthropic/v1/messages'],
    [
      'https://example.com/proxy',
      '/anthropic/v1/files',
      'https://example.com/proxy/anthropic/v1/files',
    ],
    ['https://example.com/v1/', '/models', 'https://example.com/v1/models'],
    ['https://example.com/v1', '/anthropic/v1/messages', 'https://example.com/v1/messages'],
    [
      'https://example.com/proxy/v1',
      '/anthropic/v1/files/file-123',
      'https://example.com/proxy/v1/files/file-123',
    ],
    [
      'https://example.com/anthropic/v1',
      '/anthropic/v1/messages',
      'https://example.com/anthropic/v1/messages',
    ],
    ['https://example.com/v1', '/v1/tools/asr', 'https://example.com/v1/tools/asr'],
    ['https://example.com/anthropic/v1', '/v1/tools/tts', 'https://example.com/v1/tools/tts'],
  ]
  for (const [base, endpoint, expected] of examples) {
    assert.equal(resolveApiUrl(base, endpoint), expected)
  }
})
