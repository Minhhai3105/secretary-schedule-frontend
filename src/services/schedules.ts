export interface Schedule {
  id: string
  title: string
  starts_at_utc: string
  ends_at_utc: string | null
  meeting_mode: 'online' | 'offline'
  related_person: string
  location: string | null
  meeting_url: string | null
  preparation: string | null
  notes: string | null
  cancelled_at_utc: string | null
  version: number
  status: 'upcoming' | 'past' | 'cancelled'
}

export interface ScheduleList {
  schedules: Schedule[]
  related_people: string[]
}

type ScheduleLoadErrorCode = 'network' | 'unauthorized' | 'notFound' | 'failed'

export class ScheduleLoadError extends Error {
  readonly code: ScheduleLoadErrorCode

  constructor(code: ScheduleLoadErrorCode) {
    super(code)
    this.code = code
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

export async function listSchedules(
  accessToken: string,
  from: string,
  to: string,
  relatedPerson = '',
): Promise<ScheduleList> {
  const query = new URLSearchParams({ from, to })
  if (relatedPerson) query.set('related_person', relatedPerson)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/schedules?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new ScheduleLoadError('network')
  }

  if (response.status === 401) throw new ScheduleLoadError('unauthorized')
  if (!response.ok) throw new ScheduleLoadError('failed')

  try {
    return (await response.json()) as ScheduleList
  } catch {
    throw new ScheduleLoadError('failed')
  }
}

export async function getSchedule(accessToken: string, id: string): Promise<Schedule> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new ScheduleLoadError('network')
  }

  if (response.status === 401) throw new ScheduleLoadError('unauthorized')
  if (response.status === 404) throw new ScheduleLoadError('notFound')
  if (!response.ok) throw new ScheduleLoadError('failed')

  try {
    return (await response.json()) as Schedule
  } catch {
    throw new ScheduleLoadError('failed')
  }
}

export interface ScheduleCreatePayload {
  title: string
  starts_at_utc: string
  ends_at_utc: string | null
  meeting_mode: 'online' | 'offline'
  location: string | null
  meeting_url: string | null
  related_person: string
  preparation: string | null
  notes: string | null
}

type ScheduleCreateErrorCode = 'network' | 'unauthorized' | 'validation' | 'failed'

export class ScheduleCreateError extends Error {
  readonly code: ScheduleCreateErrorCode

  constructor(code: ScheduleCreateErrorCode) {
    super(code)
    this.code = code
  }
}

export async function createSchedule(accessToken: string, payload: ScheduleCreatePayload): Promise<Schedule> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new ScheduleCreateError('network')
  }

  if (response.status === 401) throw new ScheduleCreateError('unauthorized')
  if (response.status === 422) throw new ScheduleCreateError('validation')
  if (!response.ok) throw new ScheduleCreateError('failed')

  try {
    return (await response.json()) as Schedule
  } catch {
    throw new ScheduleCreateError('failed')
  }
}

export interface ScheduleUpdatePayload extends ScheduleCreatePayload {
  version: number
}

type ScheduleUpdateErrorCode = 'network' | 'unauthorized' | 'notFound' | 'conflict' | 'cannotEdit' | 'validation' | 'failed'

export class ScheduleUpdateError extends Error {
  readonly code: ScheduleUpdateErrorCode

  constructor(code: ScheduleUpdateErrorCode) {
    super(code)
    this.code = code
  }
}

export async function updateSchedule(
  accessToken: string,
  id: string,
  payload: ScheduleUpdatePayload,
): Promise<Schedule> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new ScheduleUpdateError('network')
  }

  if (response.status === 401) throw new ScheduleUpdateError('unauthorized')
  if (response.status === 404) throw new ScheduleUpdateError('notFound')
  if (response.status === 422) throw new ScheduleUpdateError('validation')
  if (response.status === 409) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new ScheduleUpdateError(body?.detail === 'Schedule version conflict' ? 'conflict' : 'cannotEdit')
  }
  if (!response.ok) throw new ScheduleUpdateError('failed')

  try {
    return (await response.json()) as Schedule
  } catch {
    throw new ScheduleUpdateError('failed')
  }
}

type ScheduleCancelErrorCode = 'network' | 'unauthorized' | 'notFound' | 'conflict' | 'alreadyCancelled' | 'failed'

export class ScheduleCancelError extends Error {
  readonly code: ScheduleCancelErrorCode

  constructor(code: ScheduleCancelErrorCode) {
    super(code)
    this.code = code
  }
}

export async function cancelSchedule(accessToken: string, id: string, version: number): Promise<Schedule> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version }),
    })
  } catch {
    throw new ScheduleCancelError('network')
  }

  if (response.status === 401) throw new ScheduleCancelError('unauthorized')
  if (response.status === 404) throw new ScheduleCancelError('notFound')
  if (response.status === 409) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new ScheduleCancelError(body?.detail === 'Schedule already cancelled' ? 'alreadyCancelled' : 'conflict')
  }
  if (!response.ok) throw new ScheduleCancelError('failed')

  try {
    return (await response.json()) as Schedule
  } catch {
    throw new ScheduleCancelError('failed')
  }
}
