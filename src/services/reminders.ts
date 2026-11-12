export interface ReminderSettings {
  daily_enabled: boolean
  daily_time: string
  near_enabled: boolean
  lead_minutes: number
}

type ReminderErrorCode = 'network' | 'unauthorized' | 'validation' | 'failed'

export class ReminderError extends Error {
  readonly code: ReminderErrorCode

  constructor(code: ReminderErrorCode) {
    super(code)
    this.code = code
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

export async function getReminderSettings(accessToken: string): Promise<ReminderSettings> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/reminder-settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new ReminderError('network')
  }

  if (response.status === 401) throw new ReminderError('unauthorized')
  if (!response.ok) throw new ReminderError('failed')

  try {
    return (await response.json()) as ReminderSettings
  } catch {
    throw new ReminderError('failed')
  }
}

export async function patchReminderSettings(accessToken: string, settings: Partial<ReminderSettings>): Promise<ReminderSettings> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/reminder-settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    })
  } catch {
    throw new ReminderError('network')
  }

  if (response.status === 401) throw new ReminderError('unauthorized')
  if (response.status === 422) throw new ReminderError('validation')
  if (!response.ok) throw new ReminderError('failed')

  try {
    return (await response.json()) as ReminderSettings
  } catch {
    throw new ReminderError('failed')
  }
}
