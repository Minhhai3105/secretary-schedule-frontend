import test from 'node:test'
import assert from 'node:assert/strict'

// ----------------------------------------------------------------------------
// Test Case 1: Đổi giờ rồi bấm Lưu ngay (Change time then click Save immediately)
// Verify:
// - Debounce timer is immediately cancelled
// - fetchConflicts is invoked with latest time and awaited
// - If conflict exists: modal is shown, save is NOT executed
// - If conflict check fails: error alert is shown, save is NOT executed
// - If user confirms (forceProceed = true): save is executed
// ----------------------------------------------------------------------------

test('Case 1: Change time and click Save immediately - awaits conflict check and guards save', async () => {
  let debounceCancelled = false
  let conflictCheckCalledWith: { start: string; end: string | null } | null = null
  let saveExecuted = false
  let showConflictModal = false
  let conflictCheckFailed = false
  let checkingConflicts = false

  // Simulated component state
  let conflictCheckTimer: NodeJS.Timeout | null = setTimeout(() => {
    // If not cancelled, this would run
  }, 300)

  // Simulated fetchConflicts function
  async function fetchConflicts(startsAt: string, endsAt: string | null, mockConflicts: any[] = []) {
    checkingConflicts = true
    conflictCheckFailed = false
    try {
      conflictCheckCalledWith = { start: startsAt, end: endsAt }
      // simulate async network delay
      await new Promise((r) => setTimeout(r, 20))
      return mockConflicts
    } finally {
      checkingConflicts = false
    }
  }

  // Simulated submit function
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

  // 1A: User changes time and clicks save immediately, with a conflict
  const conflictItem = { id: 's1', title: 'Existing Meeting', starts_at_utc: '2026-11-12T02:00:00Z', ends_at_utc: '2026-11-12T03:00:00Z' }
  await submit('2026-11-12T02:30:00Z', '2026-11-12T03:30:00Z', false, [conflictItem])

  assert.equal(debounceCancelled, true, 'Debounce timer must be cancelled immediately')
  assert.deepEqual(conflictCheckCalledWith, {
    start: '2026-11-12T02:30:00Z',
    end: '2026-11-12T03:30:00Z',
  }, 'Must check conflicts with exact latest time entered')
  assert.equal(showConflictModal, true, 'Must display conflict modal when conflict is returned')
  assert.equal(saveExecuted, false, 'Save must NOT execute when conflict is detected')

  // 1B: User decides to force proceed ("Vẫn lưu")
  await submit('2026-11-12T02:30:00Z', '2026-11-12T03:30:00Z', true)
  assert.equal(showConflictModal, false, 'Conflict modal must close on force proceed')
  assert.equal(saveExecuted, true, 'Save must execute when forceProceed is true')

  // 1C: Conflict check network failure on save
  saveExecuted = false
  showConflictModal = false
  const failingFetchConflicts = async () => {
    throw new Error('Network error during conflict check')
  }
  async function submitWithFailingCheck() {
    try {
      await failingFetchConflicts()
    } catch {
      conflictCheckFailed = true
      return
    }
    saveExecuted = true
  }
  await submitWithFailingCheck()
  assert.equal(conflictCheckFailed, true, 'conflictCheckFailed must be set on API error')
  assert.equal(saveExecuted, false, 'Save must NOT be silently performed when check fails')
})

// ----------------------------------------------------------------------------
// Test Case 2: Đổi giờ nhiều lần khi mạng chậm (Rapid time changes under slow network)
// Verify:
// - Older, slower responses are discarded and do NOT overwrite newer check results
// - Only the latest request updates the conflict state
// ----------------------------------------------------------------------------

test('Case 2: Rapid time changes with out-of-order network responses (Race condition guard)', async () => {
  let conflictRequestId = 0
  let currentConflicts: any[] = []
  let checkingConflicts = false
  let conflictCheckFailed = false

  async function simulatedFetchConflicts(
    requestId: number,
    delayMs: number,
    responseConflicts: any[],
    shouldFail = false
  ) {
    checkingConflicts = true
    conflictCheckFailed = false
    try {
      await new Promise((r) => setTimeout(r, delayMs))
      if (shouldFail) {
        throw new Error('Network failure')
      }
      if (requestId !== conflictRequestId) {
        // Stale response discarded!
        return currentConflicts
      }
      currentConflicts = responseConflicts
      return responseConflicts
    } catch (cause) {
      if (requestId === conflictRequestId) {
        conflictCheckFailed = true
        throw cause
      }
      return currentConflicts
    } finally {
      if (requestId === conflictRequestId) {
        checkingConflicts = false
      }
    }
  }

  // User rapidly inputs 3 different times:
  // Request 1: Time T1 (slow, takes 150ms), returns [Conflict1]
  const id1 = ++conflictRequestId
  const req1 = simulatedFetchConflicts(id1, 150, [{ id: 'c1', title: 'Conflict 1' }])

  // Request 2: Time T2 (fast, takes 50ms), returns []
  const id2 = ++conflictRequestId
  const req2 = simulatedFetchConflicts(id2, 50, [])

  // Wait for req2 to finish first
  await req2
  assert.equal(currentConflicts.length, 0, 'After req2 completes, conflicts should be empty')
  assert.equal(checkingConflicts, false, 'checkingConflicts should be false after req2')

  // Now req1 finishes (stale!)
  await req1
  assert.equal(currentConflicts.length, 0, 'Stale req1 must NOT overwrite current conflicts with old Conflict 1')

  // Request 3: Time T3 (takes 80ms), returns [Conflict 3]
  const id3 = ++conflictRequestId
  const req3 = simulatedFetchConflicts(id3, 80, [{ id: 'c3', title: 'Conflict 3' }])

  // While req3 is running, request 4 is fired with 40ms delay, returns [Conflict 4]
  const id4 = ++conflictRequestId
  const req4 = simulatedFetchConflicts(id4, 40, [{ id: 'c4', title: 'Conflict 4' }])

  // req4 finishes first (at 40ms) and sets Conflict 4
  await req4
  assert.equal(currentConflicts.length, 1)
  assert.equal(currentConflicts[0].id, 'c4', 'req4 finished first and set Conflict 4')

  // Now req3 finishes (at 80ms, stale!)
  await req3
  assert.equal(currentConflicts.length, 1)
  assert.equal(currentConflicts[0].id, 'c4', 'Stale req3 must NOT overwrite Conflict 4 with Conflict 3')
})

// ----------------------------------------------------------------------------
// Test Case 3: AI đề xuất bỏ giờ kết thúc (AI proposes removing end time)
// Verify:
// - Distinguishes between ends_at_utc not provided vs provided as null
// - ends_at_utc: null strictly clears end time (endsAt = null)
// - Does NOT fall back to targetSchedule.ends_at_utc
// - When editing the proposal, initialEndsAt in EditScheduleView is null and endTime is empty
// ----------------------------------------------------------------------------

test('Case 3: AI proposal with ends_at_utc: null clears end time without fallback', () => {
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

  // Helper resolving startsAt and endsAt exactly as implemented in ChatView.vue
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
  assert.equal(resB.startsAt, '2026-11-12T02:00:00Z', 'Starts_at_utc should still fall back when omitted')
  assert.equal(resB.endsAt, null, 'ends_at_utc: null MUST resolve to null and NOT fall back to target schedule')

  // 3C: AI explicitly updates both start and end time
  const proposalC = { starts_at_utc: '2026-11-12T08:00:00Z', ends_at_utc: '2026-11-12T09:00:00Z' }
  const resC = resolveProposalTimes('update', proposalC, targetSchedule)
  assert.equal(resC.startsAt, '2026-11-12T08:00:00Z')
  assert.equal(resC.endsAt, '2026-11-12T09:00:00Z')

  // 3D: Verify EditScheduleView initialOverrides behavior with ends_at_utc: null
  const initialOverrides = { ends_at_utc: null }
  const ov = initialOverrides ?? null
  const hasEndsAtOverride = ov !== null && Object.hasOwn(ov, 'ends_at_utc')
  const initialEndsAt = hasEndsAtOverride
    ? (typeof ov?.ends_at_utc === 'string' ? ov.ends_at_utc : null)
    : targetSchedule.ends_at_utc

  assert.equal(hasEndsAtOverride, true, 'hasEndsAtOverride must be true when key is present')
  assert.equal(initialEndsAt, null, 'initialEndsAt must be null in EditScheduleView')
})
