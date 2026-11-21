import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODEL, normalizeModelId, parseModels } from '../src/services/api/models.ts'

test('reads OpenAI/DeepSeek catalogs and Anthropic display names', () => {
  assert.deepEqual(
    parseModels({ object: 'list', data: [{ id: DEFAULT_MODEL }, { id: 'provider/custom-chat' }] }),
    [
      { id: DEFAULT_MODEL, name: DEFAULT_MODEL },
      { id: 'provider/custom-chat', name: 'provider/custom-chat' },
    ]
  )
  assert.deepEqual(
    parseModels({ data: [{ id: 'custom-v2', display_name: ' Custom Chat ' }], has_more: false }),
    [{ id: 'custom-v2', name: 'Custom Chat' }]
  )
})

test('deduplicates IDs in server order and skips unusable entries', () => {
  assert.deepEqual(
    parseModels({
      data: [
        null,
        'string',
        { id: 123 },
        { id: ' ' },
        { id: 'bad model' },
        { id: ' model-a ', display_name: 'First label' },
        { id: 'model-a', display_name: 'Duplicate label' },
        { id: 'model-b', display_name: 1 },
        { id: 'model-c', display_name: '' },
      ],
    }),
    [
      { id: 'model-a', name: 'First label' },
      { id: 'model-b', name: 'model-b' },
      { id: 'model-c', name: 'model-c' },
    ]
  )
})

test('accepts empty catalogs but rejects malformed envelopes', () => {
  assert.deepEqual(parseModels({ data: [] }), [])
  assert.deepEqual(parseModels({ data: [null, { id: '' }] }), [])
  for (const response of [
    null,
    [],
    'text',
    {},
    { data: null },
    { data: {} },
    { error: 'failed' },
  ]) {
    assert.throws(() => parseModels(response))
  }
})

test('custom IDs preserve provider paths, versions and case; invalid IDs are rejected', () => {
  for (const id of [
    'deepseek-v4-pro',
    'provider/Custom.Chat:latest',
    'claude-20261121',
    'model_v2',
  ]) {
    assert.equal(normalizeModelId(` ${id} `), id)
  }
  for (const id of ['', ' \n ', 'two models', 'model\nname', 'model\u0000name', 'x'.repeat(257)]) {
    assert.throws(() => normalizeModelId(id))
  }
})
