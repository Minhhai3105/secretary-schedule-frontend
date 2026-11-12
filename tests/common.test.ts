import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCalendarDate, formatVietnamDate } from '../src/utils/date.ts'
import { passwordError } from '../src/utils/password.ts'

test('formats a UTC evening as the next Vietnam calendar day in both locales', () => {
  const iso = '2026-11-09T18:30:00Z'
  assert.equal(formatVietnamDate(iso, 'vi'), '10/11/2026')
  assert.equal(formatVietnamDate(iso, 'en'), '11/10/2026')
  assert.equal(formatCalendarDate('2026-11-10', 'en', false), '11/10')
})

test('shared password validation keeps length and confirmation checks', () => {
  assert.equal(passwordError('short', 'short'), 'length')
  assert.equal(passwordError('Example-pass-123', 'different'), 'mismatch')
  assert.equal(passwordError('Example-pass-123', 'Example-pass-123'), null)
})
