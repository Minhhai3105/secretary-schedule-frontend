export interface Schedule {
  id: string
  title: string
  starts_at_utc: string
  ends_at_utc: string | null
  meeting_mode: 'online' | 'offline'
  related_person: string
}

export interface ScheduleList {
  schedules: Schedule[]
  related_people: string[]
}

type ScheduleLoadErrorCode = 'network' | 'unauthorized' | 'failed'

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
