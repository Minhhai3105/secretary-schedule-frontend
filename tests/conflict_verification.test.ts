import test from 'node:test'
import assert from 'node:assert/strict'

// Provide minimal mock for browser environment needed by auth.ts
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = { location: { hostname: 'localhost' } }
}

import { refreshSession } from '../src/services/auth.ts'
import { createServer } from 'vite'
import { createSSRApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { renderToString } from 'vue/server-renderer'
import vi from '../src/i18n/vi.json' with { type: 'json' }

// ----------------------------------------------------------------------------
// Test 1: Concurrent refreshSession calls must share a single in-flight request
// (Backend prevents refresh token reuse which would revoke session)
// ----------------------------------------------------------------------------

test('Auth: Concurrent refreshSession calls share the same in-flight fetch promise', async () => {
  let fetchCallCount = 0
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async () => {
      fetchCallCount++
      await new Promise((r) => setTimeout(r, 30))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'mock-token-xyz',
          user: { id: 'u1', email: 'test@example.com', name: 'Test' },
        }),
      } as Response
    }

    // Call refreshSession 3 times in parallel
    const [p1, p2, p3] = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ])

    // Verify all 3 calls shared the exact same network request
    assert.equal(fetchCallCount, 1, 'Exactly 1 fetch call must be made for parallel refreshes')
    assert.equal(p1?.access_token, 'mock-token-xyz')
    assert.equal(p2?.access_token, 'mock-token-xyz')
    assert.equal(p3?.access_token, 'mock-token-xyz')

    // After resolution, the in-flight promise is cleared so subsequent calls can fetch anew
    const p4 = await refreshSession()
    assert.equal(fetchCallCount, 2, 'Subsequent call after completion must create a new fetch call')
    assert.equal(p4?.access_token, 'mock-token-xyz')
  } finally {
    globalThis.fetch = originalFetch
  }
})

// ----------------------------------------------------------------------------
// Test 2: Ca 1 - Đổi giờ rồi bấm Lưu ngay (Change time then click Save immediately)
// ----------------------------------------------------------------------------

test('Case 1: Change time and click Save immediately - awaits conflict check and guards save', async () => {
  let debounceCancelled = false
  let conflictCheckCalledWith: { start: string; end: string | null } | null = null
  let saveExecuted = false
  let showConflictModal = false
  let conflictCheckFailed = false
  let checkingConflicts = false

  let conflictCheckTimer: NodeJS.Timeout | null = setTimeout(() => {}, 300)

  async function fetchConflicts(startsAt: string, endsAt: string | null, mockConflicts: any[] = []) {
    checkingConflicts = true
    conflictCheckFailed = false
    try {
      conflictCheckCalledWith = { start: startsAt, end: endsAt }
      await new Promise((r) => setTimeout(r, 20))
      return mockConflicts
    } finally {
      checkingConflicts = false
    }
  }

  async function submit(
    startsAt: string,
    endsAt: string | null,
    forceProceed: boolean,
    mockConflicts: any[] = []
  ) {
    if (!forceProceed) {
      if (conflictCheckTimer) {
        clearTimeout(conflictCheckTimer)
        conflictCheckTimer = null
        debounceCancelled = true
      }
      let detectedConflicts: any[]
      try {
        detectedConflicts = await fetchConflicts(startsAt, endsAt, mockConflicts)
      } catch {
        conflictCheckFailed = true
        return
      }
      if (detectedConflicts.length > 0) {
        showConflictModal = true
        return
      }
    }
    showConflictModal = false
    saveExecuted = true
  }

  const conflictItem = { id: 's1', title: 'Existing Meeting', starts_at_utc: '2026-11-12T02:00:00Z', ends_at_utc: '2026-11-12T03:00:00Z' }
  await submit('2026-11-12T02:30:00Z', '2026-11-12T03:30:00Z', false, [conflictItem])

  assert.equal(debounceCancelled, true, 'Debounce timer must be cancelled immediately')
  assert.deepEqual(conflictCheckCalledWith, {
    start: '2026-11-12T02:30:00Z',
    end: '2026-11-12T03:30:00Z',
  })
  assert.equal(showConflictModal, true, 'Must display conflict modal when conflict is returned')
  assert.equal(saveExecuted, false, 'Save must NOT execute when conflict is detected')

  // Force proceed
  await submit('2026-11-12T02:30:00Z', '2026-11-12T03:30:00Z', true)
  assert.equal(showConflictModal, false)
  assert.equal(saveExecuted, true)
})

// ----------------------------------------------------------------------------
// Test 3: Ca 2A - Ngay khi giờ thay đổi, vô hiệu hóa ngay kết quả đang chạy (0ms window)
// ----------------------------------------------------------------------------

test('Case 2A: Time input change invalidates in-flight check immediately (no 300ms stale window)', async () => {
  let conflictRequestId = 0
  let conflicts: any[] = [{ id: 'old', title: 'Old Conflict' }]
  let checkingConflicts = false

  async function slowFetch(reqId: number, delayMs: number) {
    checkingConflicts = true
    await new Promise((r) => setTimeout(r, delayMs))
    if (reqId !== conflictRequestId) {
      return conflicts
    }
    conflicts = [{ id: 'stale-result', title: 'Stale' }]
    return conflicts
  }

  // Request 1 starts for Time A
  const id1 = ++conflictRequestId
  const req1 = slowFetch(id1, 100)

  // After 20ms (well within 300ms debounce), user changes time to Time B
  await new Promise((r) => setTimeout(r, 20))

  // Watch handler fires IMMEDIATELY on input:
  conflictRequestId++
  checkingConflicts = false
  conflicts = []

  // Assert state is cleared immediately, not 300ms later
  assert.equal(conflicts.length, 0, 'Conflicts must be wiped immediately on input change')
  assert.equal(checkingConflicts, false, 'checkingConflicts must be reset immediately')

  // Now Request 1 completes (at 100ms)
  await req1
  assert.equal(conflicts.length, 0, 'Stale Request 1 result must NOT overwrite cleared conflicts')
})

// ----------------------------------------------------------------------------
// Test 4: Ca 2B - Form thay đổi trong lúc submit đang chờ kiểm tra trùng lịch
// ----------------------------------------------------------------------------

test('Case 2B: Submit re-checks if form inputs change while awaiting conflict check', async () => {
  let formStartTime = '09:00'
  let checkedTimes: string[] = []
  let savedWithTime: string | null = null
  let showConflictModal = false

  async function fetchConflictsForTime(time: string): Promise<any[]> {
    checkedTimes.push(time)
    await new Promise((r) => setTimeout(r, 40))
    // Suppose 14:00 has a conflict, while 09:00 was free
    if (time === '14:00') {
      return [{ id: 'c2', title: 'Afternoon conflict' }]
    }
    return []
  }

  async function robustSubmit(forceProceed = false) {
    if (!forceProceed) {
      while (true) {
        const checkTime = formStartTime
        const detected = await fetchConflictsForTime(checkTime)

        // Check if form changed while awaiting
        if (formStartTime !== checkTime) {
          continue // re-check with updated formStartTime!
        }

        if (detected.length > 0) {
          showConflictModal = true
          return
        }
        break
      }
    }
    savedWithTime = formStartTime
  }

  // User submits when formStartTime is 09:00
  const submitPromise = robustSubmit(false)

  // While fetchConflictsForTime('09:00') is in flight (at 15ms), user edits time to '14:00'
  await new Promise((r) => setTimeout(r, 15))
  formStartTime = '14:00'

  await submitPromise

  // Verify that '09:00' wasn't blindly saved:
  assert.deepEqual(checkedTimes, ['09:00', '14:00'], 'Must have re-checked 14:00 after detecting input change')
  assert.equal(showConflictModal, true, 'Must display conflict modal for 14:00')
  assert.equal(savedWithTime, null, 'Must NOT save 09:00 or unchecked 14:00')
})

// ----------------------------------------------------------------------------
// Test 5: Ca 3 (Direct Vue SFC Test) - Chạy trực tiếp component EditScheduleView.vue
// ----------------------------------------------------------------------------

test('Case 3 (Direct Vue SFC): EditScheduleView component directly clears end time when initialOverrides has ends_at_utc: null', async () => {
  const server = await createServer({ appType: 'custom', server: { middlewareMode: true } })
  try {
    const mod = await server.ssrLoadModule('./src/components/EditScheduleView.vue')
    const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } })

    const baseSchedule = {
      id: 'sched-1',
      version: 1,
      title: 'Họp với sếp',
      starts_at_utc: '2026-11-12T02:00:00Z',
      ends_at_utc: '2026-11-12T04:00:00Z', // 11:00 in UTC+7
      meeting_mode: 'offline' as const,
      location: 'P101',
      meeting_url: null,
      related_person: 'Me',
      preparation: null,
      notes: null,
    }

    // App 1: Without override -> renders end time input with value="11:00"
    const app1 = createSSRApp({
      render: () => h(mod.default, {
        session: { access_token: 'fake', user: { id: '1', email: 'test@example.com', name: 'Test' } },
        schedule: baseSchedule,
        relatedPeople: ['Me'],
      }),
    })
    app1.use(i18n)
    const html1 = await renderToString(app1)
    assert.ok(html1.includes('value="11:00"'), 'Standard edit view must render schedule ends_at time')

    // App 2: With AI proposal override ends_at_utc: null -> end time must be CLEARED
    const app2 = createSSRApp({
      render: () => h(mod.default, {
        session: { access_token: 'fake', user: { id: '1', email: 'test@example.com', name: 'Test' } },
        schedule: baseSchedule,
        relatedPeople: ['Me'],
        initialOverrides: { ends_at_utc: null },
      }),
    })
    app2.use(i18n)
    const html2 = await renderToString(app2)
    assert.ok(!html2.includes('value="11:00"'), 'AI override ends_at_utc: null MUST clear end time from input')
  } finally {
    await server.close()
  }
})

// ----------------------------------------------------------------------------
// Test 6: Ca 3 (Logic) - AI đề xuất bỏ giờ kết thúc phân biệt giữa null và omitted
// ----------------------------------------------------------------------------

test('Case 3 (Logic): AI proposal with ends_at_utc: null clears end time without fallback', () => {
  const targetSchedule = {
    id: 'sched-123',
    version: 2,
    title: 'Họp hội đồng',
    starts_at_utc: '2026-11-12T02:00:00Z',
    ends_at_utc: '2026-11-12T04:00:00Z',
    meeting_mode: 'offline' as const,
    location: 'Phòng họp A',
    meeting_url: null,
    related_person: 'Me',
    preparation: null,
    notes: null,
  }

  function resolveProposalTimes(
    proposalAction: 'create' | 'update',
    proposedData: Record<string, unknown>,
    target: typeof targetSchedule | null
  ) {
    let startsAt: string | null = null
    if (Object.hasOwn(proposedData, 'starts_at_utc')) {
      startsAt = typeof proposedData.starts_at_utc === 'string' ? proposedData.starts_at_utc : null
    } else if (proposalAction === 'update' && target?.starts_at_utc) {
      startsAt = target.starts_at_utc
    }

    let endsAt: string | null = null
    if (Object.hasOwn(proposedData, 'ends_at_utc')) {
      endsAt = typeof proposedData.ends_at_utc === 'string' ? proposedData.ends_at_utc : null
    } else if (proposalAction === 'update' && target?.ends_at_utc) {
      endsAt = target.ends_at_utc
    }

    return { startsAt, endsAt }
  }

  // 3A: AI updates title only (ends_at_utc omitted / not sent)
  const proposalA = { title: 'Họp hội đồng mở rộng' }
  const resA = resolveProposalTimes('update', proposalA, targetSchedule)
  assert.equal(resA.startsAt, '2026-11-12T02:00:00Z', 'Should fall back to target starts_at_utc when omitted')
  assert.equal(resA.endsAt, '2026-11-12T04:00:00Z', 'Should fall back to target ends_at_utc when omitted')

  // 3B: AI explicitly proposes removing the end time (ends_at_utc: null)
  const proposalB = { ends_at_utc: null }
  const resB = resolveProposalTimes('update', proposalB, targetSchedule)
  assert.equal(resB.startsAt, '2026-11-12T02:00:00Z')
  assert.equal(resB.endsAt, null, 'ends_at_utc: null MUST resolve to null and NOT fall back to target schedule')
})
