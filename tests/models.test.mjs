import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODEL, normalizeModelId, parseModels } from '../src/services/api/models.ts'
import {
  detectUnsupportedThinking,
  modelCapabilitiesGeneration,
  resetModelCapabilities,
  rememberModelCapabilities,
  rememberUnsupportedThinking,
  withoutUnsupportedThinking,
} from '../src/services/api/modelCapabilities.ts'

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

test('uses explicit reasoning capabilities and leaves unknown custom models unknown', () => {
  assert.deepEqual(
    parseModels({
      data: [
        { id: 'no-reasoning', capabilities: { reasoning: false } },
        { id: 'has-reasoning', supported_parameters: ['thinking', 'output_config.effort'] },
        { id: 'no-effort', supports_thinking: true, supports_reasoning_effort: false },
        { id: 'unknown', capabilities: ['image'], supported_parameters: 'invalid' },
      ],
    }),
    [
      { id: 'no-reasoning', name: 'no-reasoning', thinking: false },
      { id: 'has-reasoning', name: 'has-reasoning', thinking: true, effort: true },
      { id: 'no-effort', name: 'no-effort', thinking: true, effort: false },
      { id: 'unknown', name: 'unknown' },
    ]
  )
})

test('recognizes unsupported settings but preserves validation and unrelated API errors', () => {
  assert.deepEqual(
    detectUnsupportedThinking({ status: 400, message: "Unsupported parameter 'thinking'" }),
    { thinking: false }
  )
  assert.deepEqual(
    detectUnsupportedThinking({
      status: 422,
      message: 'Extra inputs are not permitted',
      parameter: 'thinking.type',
    }),
    { thinking: false }
  )
  assert.deepEqual(
    detectUnsupportedThinking({ status: 400, message: 'reasoning_effort is not supported' }),
    { effort: false }
  )
  assert.deepEqual(
    detectUnsupportedThinking({ status: 400, message: '该模型不支持 thinking 设置' }),
    { thinking: false }
  )
  for (const error of [
    { status: 401, message: 'thinking is not supported' },
    { status: 429, message: 'thinking is not supported' },
    { status: 500, message: 'thinking is not supported' },
    { status: 400, message: 'thinking.budget_tokens must be greater than 1024' },
    { status: 400, message: 'Unsupported parameter temperature' },
    { message: 'Unsupported parameter thinking' },
  ]) {
    assert.deepEqual(detectUnsupportedThinking(error), {})
  }
})

test('removes unsupported thinking for both switch states and isolates each model and service', () => {
  const base = 'https://provider-capability.example/v1'
  rememberUnsupportedThinking(base, 'custom', { thinking: false })
  for (const type of ['enabled', 'disabled']) {
    const body = {
      model: 'custom',
      thinking: { type },
      output_config: { effort: 'high' },
      messages: ['question'],
    }
    assert.deepEqual(withoutUnsupportedThinking(base, body), {
      model: 'custom',
      messages: ['question'],
    })
    assert.equal(body.thinking.type, type)
    assert.deepEqual(withoutUnsupportedThinking('https://another.example', body), body)
    assert.deepEqual(withoutUnsupportedThinking(base, { ...body, model: 'other-model' }), {
      ...body,
      model: 'other-model',
    })
  }
  rememberModelCapabilities(base, [{ id: 'custom', thinking: true, effort: false }])
  assert.deepEqual(
    withoutUnsupportedThinking(base, {
      model: 'custom',
      thinking: { type: 'enabled' },
      output_config: { effort: 'max' },
    }),
    { model: 'custom', thinking: { type: 'enabled' } }
  )
})

test('a key change clears old capabilities and prevents older in-flight requests restoring them', () => {
  const base = 'https://key-change.example'
  const body = { model: 'same-model', thinking: { type: 'enabled' } }
  rememberUnsupportedThinking(base, body.model, { thinking: false })
  assert.equal(withoutUnsupportedThinking(base, body).thinking, undefined)
  const oldGeneration = modelCapabilitiesGeneration()
  resetModelCapabilities()
  assert.deepEqual(withoutUnsupportedThinking(base, body), body)
  rememberUnsupportedThinking(base, body.model, { thinking: false }, oldGeneration)
  rememberModelCapabilities(base, [{ id: body.model, thinking: false }], oldGeneration)
  assert.deepEqual(withoutUnsupportedThinking(base, body), body)
  rememberUnsupportedThinking(base, body.model, { thinking: false })
  assert.equal(withoutUnsupportedThinking(base, body).thinking, undefined)
})
