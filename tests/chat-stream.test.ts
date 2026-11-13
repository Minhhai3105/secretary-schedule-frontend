import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatError, streamChatMessage } from '../src/services/chat.ts'

function chunk(content?: string, finish: string | null = null) {
  return 'data: ' + JSON.stringify({
    id: 'chatcmpl-stream', object: 'chat.completion.chunk', created: 1, model: 'secretary-schedule',
    choices: [{ index: 0, delta: content === undefined ? {} : { content }, finish_reason: finish }],
  }) + '\r\n\r\n'
}

function response(wire: string, split = 1): Response {
  const bytes = new TextEncoder().encode(wire)
  let offset = 0
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(offset, offset + split))
      offset += split
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}

test('SSE parses split UTF-8 and CRLF, renders answer before DONE and validates final proposal', async () => {
  const previousFetch = globalThis.fetch
  let request: RequestInit | undefined
  const answer = 'Xin chào "bạn"\n😀'
  const proposal = { id: 'proposal', action: 'update', schedule_id: 'schedule', schedule_version: 1,
    proposed_data: [{ field: 'location', value: null }], expires_at_utc: '2026-11-20T00:00:00Z' }
  const content = JSON.stringify({ answer, schedules: [], proposal })
  const wire = ': heartbeat\r\n\r\n' + [...content].map((letter) => chunk(letter)).join('')
    + chunk(undefined, 'stop') + 'data: [DONE]\r\n\r\n'
  globalThis.fetch = async (_, options) => { request = options; return response(wire) }
  try {
    const answers: string[] = []
    let complete = false
    const result = await streamChatMessage('jwt', 'Hello', (value) => {
      assert.equal(complete, false)
      answers.push(value)
    })
    complete = true
    assert.equal(JSON.parse(String(request?.body)).stream, true)
    assert.equal(new Headers(request?.headers).get('Authorization'), 'Bearer jwt')
    assert.equal(answers.at(-1), answer)
    assert.ok(answers.includes('Xin'))
    assert.deepEqual(result.proposal?.proposed_data, { location: null })
    assert.equal(Object.hasOwn(result.proposal!.proposed_data, 'title'), false)
  } finally { globalThis.fetch = previousFetch }
})

test('SSE refuses truncated, malformed, unfinished and error streams without accepting a proposal', async () => {
  const previousFetch = globalThis.fetch
  const payload = JSON.stringify({ answer: 'Hello', schedules: [], proposal: null })
  const invalid = [
    chunk(payload),
    chunk(payload) + chunk(undefined, 'stop'),
    chunk(payload) + 'data: [DONE]\n\n',
    chunk(payload) + chunk(undefined, 'length') + 'data: [DONE]\n\n',
    chunk('{"answer":"Partial') + 'data: {"error":{"code":"stream_failed"}}\n\n',
    chunk('{"answer":"Partial') + chunk(undefined, 'stop') + 'data: [DONE]\n\n',
    'data: not-json\n\n',
  ]
  try {
    for (const wire of invalid) {
      globalThis.fetch = async () => response(wire, 7)
      await assert.rejects(streamChatMessage('jwt', 'Hi', () => {}), (error: unknown) =>
        error instanceof ChatError && error.code === 'failed')
    }
  } finally { globalThis.fetch = previousFetch }
})

test('SSE handles escaped Unicode split between events and only calls fetch once on HTTP failure', async () => {
  const previousFetch = globalThis.fetch
  const pieces = ['{"answer":"Hi\\u', 'D83D', '\\uDE00', '","schedules":[],"proposal":null}']
  globalThis.fetch = async () => response(pieces.map((piece) => chunk(piece)).join('')
    + chunk(undefined, 'stop') + 'data: [DONE]\n\n')
  try {
    const result = await streamChatMessage('jwt', 'Hi', (answer) => assert.ok(!answer.endsWith('\uD83D')))
    assert.equal(result.answer, 'Hi😀')
    for (const [status, code] of [[401, 'unauthorized'], [400, 'validation'], [429, 'failed'], [502, 'failed']] as const) {
      let calls = 0
      globalThis.fetch = async () => { calls++; return new Response('', { status }) }
      await assert.rejects(streamChatMessage('jwt', 'Hi', () => {}), (error: unknown) =>
        error instanceof ChatError && error.code === code)
      assert.equal(calls, 1)
    }
  } finally { globalThis.fetch = previousFetch }
})

test('unmount abort cancels an in-flight stream without retrying', async () => {
  const previousFetch = globalThis.fetch
  const controller = new AbortController()
  let calls = 0
  globalThis.fetch = async (_, options) => {
    calls++
    return new Promise<Response>((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
  }
  try {
    const result = streamChatMessage('jwt', 'Hi', () => {}, controller.signal)
    controller.abort()
    await assert.rejects(result, (error: unknown) => error instanceof ChatError && error.code === 'network')
    assert.equal(calls, 1)
  } finally { globalThis.fetch = previousFetch }
})

test('SDK emits a provisional answer while the HTTP response is still open', { timeout: 3000 }, async () => {
  const previousFetch = globalThis.fetch
  const ready = Promise.withResolvers<void>()
  let controller: ReadableStreamDefaultController<Uint8Array>
  const encode = (value: string) => new TextEncoder().encode(value)
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
  globalThis.fetch = async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
  try {
    let complete = false
    const result = streamChatMessage('jwt', 'Hello', (answer) => {
      assert.equal(complete, false)
      if (answer === 'Live') ready.resolve()
    })
    controller!.enqueue(encode(chunk('{"answer":"Live')))
    await ready.promise
    controller!.enqueue(encode(chunk(' answer","schedules":[],"proposal":null}')
      + chunk(undefined, 'stop') + 'data: [DONE]\n\n'))
    controller!.close()
    const final = await result
    complete = true
    assert.equal(final.answer, 'Live answer')
    assert.equal(final.proposal, null)
  } finally { globalThis.fetch = previousFetch }
})

test('SDK transport rejects an oversized stream without retrying the request', async () => {
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(new Uint8Array(1_000_001), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  try {
    await assert.rejects(streamChatMessage('jwt', 'Hello', () => {}), (error: unknown) =>
      error instanceof ChatError && error.code === 'failed')
    assert.equal(calls, 1)
  } finally { globalThis.fetch = previousFetch }
})
