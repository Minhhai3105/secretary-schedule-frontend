import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatError, sendChatMessage } from '../src/services/chat.ts'

function envelope(content: unknown, finishReason = 'stop') {
  return {
    id: 'chatcmpl-test', object: 'chat.completion', created: 1, model: 'secretary-schedule',
    choices: [{ index: 0, finish_reason: finishReason,
      message: { role: 'assistant', content: JSON.stringify(content) } }],
  }
}

test('chat uses the completions request contract and parses structured content', async () => {
  const previousFetch = globalThis.fetch
  let requestUrl = ''
  let requestOptions: RequestInit | undefined
  globalThis.fetch = async (input, options) => {
    requestUrl = String(input)
    requestOptions = options
    return Response.json(envelope({ answer: 'What time?', schedules: [], proposal: null }))
  }
  try {
    const result = await sendChatMessage('user-access-token', 'Plan reading')
    assert.equal(requestUrl, 'http://localhost:8000/v1/chat/completions')
    assert.equal(new Headers(requestOptions?.headers).get('Authorization'), 'Bearer user-access-token')
    const body = JSON.parse(String(requestOptions?.body))
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Plan reading' }])
    assert.equal(body.model, 'secretary-schedule')
    assert.equal(body.stream, false)
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
    assert.deepEqual(result, { answer: 'What time?', schedules: [], proposal: null })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('proposal field pairs preserve null and omitted fields for the existing UI', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json(envelope({
    answer: 'Confirm this update', schedules: [], proposal: {
      id: 'proposal-test', action: 'update', schedule_id: 'schedule-test', schedule_version: 2,
      proposed_data: [{ field: 'location', value: null }], expires_at_utc: '2026-11-20T00:00:00Z',
    },
  }))
  try {
    const result = await sendChatMessage('token', 'Remove the location')
    assert.deepEqual(result.proposal?.proposed_data, { location: null })
    assert.equal(Object.hasOwn(result.proposal!.proposed_data, 'starts_at_utc'), false)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('malformed, unfinished and duplicate proposal responses become controlled chat errors', async () => {
  const previousFetch = globalThis.fetch
  const invalid = [
    {},
    envelope({ answer: 'Hi', schedules: [], proposal: null }, 'length'),
    envelope({ answer: 'Hi', schedules: [] }),
    envelope({ answer: 'Hi', schedules: [], proposal: { proposed_data: [
      { field: 'location', value: 'A' }, { field: 'location', value: 'B' },
    ] } }),
  ]
  try {
    for (const response of invalid) {
      globalThis.fetch = async () => Response.json(response)
      await assert.rejects(sendChatMessage('token', 'Hello'), (error: unknown) =>
        error instanceof ChatError && error.code === 'failed')
    }
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('completion HTTP errors preserve refresh, validation and server-error handling', async () => {
  const previousFetch = globalThis.fetch
  try {
    for (const [status, code] of [[401, 'unauthorized'], [400, 'validation'], [502, 'failed']] as const) {
      globalThis.fetch = async () => Response.json({ error: { message: 'Test error' } }, { status })
      await assert.rejects(sendChatMessage('token', 'Hello'), (error: unknown) =>
        error instanceof ChatError && error.code === code)
    }
  } finally {
    globalThis.fetch = previousFetch
  }
})
