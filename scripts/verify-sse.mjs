// Companion to the backend's scripts/verify_sse.py; synthetic data only.
import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { values } = parseArgs({ options: {
  backend: { type: 'string' }, probe: { type: 'string' },
  mode: { type: 'string', default: 'both' },
} })
assert.ok(values.backend && values.probe, 'Run through the backend verification script')
const realFetch = globalThis.fetch
const { createServer } = await import(pathToFileURL(resolve('node_modules/vite/dist/node/index.js')).href)
const cacheDir = await mkdtemp(join(tmpdir(), 'secretary-sse-probe-'))
const vite = await createServer({ cacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const reports = []
try {
  const { streamChatMessage } = await vite.ssrLoadModule('/src/services/chat.ts')
  for (const mode of values.mode === 'both' ? ['controlled', 'live'] : [values.mode]) {
    const start = await realFetch(`${values.probe}/probe/start`, {
      method: 'POST', body: JSON.stringify({ mode }),
    })
    assert.equal(start.status, 200)
    const login = await realFetch(`${values.backend}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `sse-${mode}@example.com`, password: 'Sse-probe-only-123' }),
    })
    assert.equal(login.status, 200)
    const { access_token } = await login.json()
    const events = []
    const event = (name, extra = {}) => events.push({ event: name, at_ms: Date.now(), ...extra })
    globalThis.fetch = async (url, init) => {
      const response = await realFetch(url, init)
      if (!String(url).endsWith('/v1/chat/completions')) return response
      event('fe_headers', { status: response.status })
      assert.equal(response.headers.get('Content-Type')?.includes('text/event-stream'), true)
      return new Response(response.body.pipeThrough(new TransformStream({
        transform(bytes, controller) {
          event('fe_wire_bytes', { bytes: bytes.byteLength })
          controller.enqueue(bytes)
        },
      })), { status: response.status, headers: response.headers })
    }
    let released
    let firstAnswer = true
    let complete = false
    const requestStart = Date.now()
    event('fe_request')
    try {
      const result = await streamChatMessage(access_token,
        mode === 'controlled' ? 'Controlled SSE verification'
          : 'Hãy giải thích bằng 5 gạch đầu dòng cách chuẩn bị cho một cuộc họp, khoảng 150 từ. Chỉ trả lời, không tạo, sửa hoặc hủy lịch.',
        answer => {
          assert.equal(complete, false)
          event('fe_answer', { chars: answer.length })
          if (mode === 'controlled' && firstAnswer) {
            firstAnswer = false
            assert.equal(answer, 'A')
            released = (async () => {
              const state = await (await realFetch(`${values.probe}/probe/state`)).json()
              assert.equal(state.released, false, 'B must still be withheld when FE receives A')
              assert.equal(state.upstream_completed, false)
              const response = await realFetch(`${values.probe}/probe/release`, {
                method: 'POST', body: JSON.stringify({ observed_at_ms: Date.now() }),
              })
              assert.equal(response.status, 200)
            })()
          }
        })
      await released
      complete = true
      event('fe_complete')
      assert.equal(result.proposal, null)
      if (mode === 'controlled') {
        assert.ok(released, 'The SDK must emit A before the response finishes')
        assert.equal(result.answer, 'A B')
      }
      const updates = events.filter(item => item.event === 'fe_answer')
      assert.ok(updates.length > 0)
      reports.push({ mode, result: 'PASS', first_answer_ms: updates[0].at_ms - requestStart,
        last_answer_ms: updates.at(-1).at_ms - requestStart,
        complete_ms: Date.now() - requestStart, answer_updates: updates.length })
    } catch (error) {
      event('fe_failed', { code: error?.code ?? error?.name ?? 'unknown' })
      reports.push({ mode, result: 'FAIL', error_code: error?.code ?? error?.name ?? 'unknown' })
    } finally {
      globalThis.fetch = realFetch
      await realFetch(`${values.probe}/probe/events`, { method: 'POST', body: JSON.stringify({ mode, events }) })
      console.log(JSON.stringify({ stage_result: reports.at(-1) }))
    }
  }
  await realFetch(`${values.probe}/probe/results`, { method: 'POST', body: JSON.stringify(reports) })
  console.log(JSON.stringify({ frontend_sse_probe: reports }))
  if (reports.some(item => item.result !== 'PASS')) process.exitCode = 1
} finally {
  globalThis.fetch = realFetch
  await vite.close()
  await rm(cacheDir, { recursive: true, force: true })
}
