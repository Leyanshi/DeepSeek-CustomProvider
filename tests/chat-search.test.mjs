import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchSession, searchTerms } from '../src/services/chat/searchText.ts'
import { normalizeGeneratedTitle } from '../src/services/chat/titleText.ts'

const session = {
  id: 'search-test',
  title: '旅行计划',
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { id: 'u', role: 'user', content: '计划去上海，预算 2000 元', files: [], createdAt: 1 },
    {
      id: 'a',
      role: 'assistant',
      blocks: [
        { type: 'text', text: 'Visit the Bund and Café.' },
        { type: 'thinking', thinking: '交通路线比较' },
      ],
      createdAt: 2,
    },
    {
      id: 'branch',
      role: 'user',
      content: '另一个版本：杭州西湖',
      parentId: null,
      files: [],
      createdAt: 3,
    },
  ],
}

test('matches words across title and messages, including saved versions and thinking text', () => {
  for (const query of ['旅行 上海', '杭州西湖', '交通路线', 'BUND café']) {
    assert.ok(matchSession(session, searchTerms(query), '新对话'), query)
  }
  assert.equal(matchSession(session, searchTerms('上海 深圳'), '新对话'), null)
})

test('normalizes full-width characters, case and composed Unicode and preserves excerpt casing', () => {
  assert.deepEqual(searchTerms(' ＢＵＮＤ bund cafe\u0301 '), ['bund', 'café'])
  assert.match(matchSession(session, searchTerms('bund'), '新对话').excerpt, /Visit the Bund/)
})

test('searches fallback names and bounds excerpts without returning full message history', () => {
  assert.ok(matchSession({ ...session, title: '' }, ['新对话'], '新对话'))
  const large = {
    ...session,
    messages: [{ role: 'user', content: '前'.repeat(20000) + 'needle' + '后'.repeat(20000) }],
  }
  const result = matchSession(large, ['needle'], '新对话')
  assert.match(result.excerpt, /needle/)
  assert.ok(result.excerpt.length <= 142)
  assert.equal('messages' in result, false)
})

test('ignores binary and encrypted payloads but searches displayed web source text', () => {
  const web = {
    ...session,
    messages: [
      {
        role: 'assistant',
        blocks: [
          {
            type: 'web_search_tool_result',
            content: [
              {
                type: 'web_search_result',
                title: '来源标题',
                snippet: '可读摘要',
                encrypted_content: 'secretEncodedPayload',
              },
            ],
          },
        ],
      },
    ],
  }
  assert.ok(matchSession(web, ['可读摘要'], '新对话'))
  assert.equal(matchSession(web, ['secretencodedpayload'], '新对话'), null)
})

test('accepts concise titles and rejects empty, multiline and verbose responses', () => {
  assert.equal(normalizeGeneratedTitle(' 标题：“上海旅行计划” '), '上海旅行计划')
  assert.equal(normalizeGeneratedTitle('**Weekend plans**'), 'Weekend plans')
  for (const output of ['', '  ', '标题：', '旅行计划\n下面是解释', '长'.repeat(61)]) {
    assert.equal(normalizeGeneratedTitle(output), null)
  }
})
