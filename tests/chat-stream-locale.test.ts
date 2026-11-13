import assert from 'node:assert/strict'
import test from 'node:test'
import { i18n } from '../src/i18n/index.ts'
import vi from '../src/i18n/vi.json' with { type: 'json' }
import en from '../src/i18n/en.json' with { type: 'json' }
import { streamBackendChat } from '../src/services/backend-chat.ts'

function hasMessage(error: unknown, expected: string): boolean {
  // The SDK may wrap transport failures in APICallError while preserving the original cause.
  return error instanceof Error && (error.message === expected
    || (error.cause instanceof Error && error.cause.message === expected))
}

function unfinishedResponse(): Response {
  const base = { id: 'chatcmpl-locale', object: 'chat.completion.chunk', created: 1, model: 'secretary-schedule' }
  const data = (delta: object, finish_reason: string | null) => 'data: ' + JSON.stringify({
    ...base, choices: [{ index: 0, delta, finish_reason }],
  }) + '\n\n'
  return new Response(data({ content: '{"answer":"Hi","schedules":[],"proposal":null}' }, null) + data({}, 'stop'),
    { headers: { 'Content-Type': 'text/event-stream' } })
}

test('stream guard messages follow the current locale after the SDK has already loaded', async () => {
  const previousFetch = globalThis.fetch
  const previousLocale = i18n.global.locale.value
  try {
    for (const locale of ['vi', 'en', 'vi'] as const) {
      i18n.global.locale.value = locale
      const expected = locale === 'vi' ? vi.chat : en.chat
      globalThis.fetch = async () => new Response(new Uint8Array(1_000_001),
        { headers: { 'Content-Type': 'text/event-stream' } })
      await assert.rejects(streamBackendChat('jwt', 'Hi', () => {}), (error: unknown) =>
        hasMessage(error, expected.streamTooLarge))
      globalThis.fetch = async () => unfinishedResponse()
      await assert.rejects(streamBackendChat('jwt', 'Hi', () => {}), (error: unknown) =>
        hasMessage(error, expected.streamMissingDone))
    }
  } finally {
    globalThis.fetch = previousFetch
    i18n.global.locale.value = previousLocale
  }
})
