export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'cancelled'
export type DeliveryKind = 'daily' | 'near' | 'update'

export interface EmailDelivery {
  id: string
  schedule_id: string | null
  event_key: string
  kind: DeliveryKind
  applicable_date_vietnam: string | null
  due_at_utc: string
  status: DeliveryStatus
  sent_at_utc: string | null
}

export interface EmailAttempt {
  id: string
  attempt_number: number
  status: 'sending' | 'success' | 'failed' | 'unknown'
  started_at_utc: string
  finished_at_utc: string | null
  error_message: string | null
}

export interface EmailDeliveryDetail extends EmailDelivery {
  attempts: EmailAttempt[]
}

export interface EmailDeliveryPage {
  deliveries: EmailDelivery[]
  paging: { page: number; page_size: number; total: number; total_pages: number }
}

type EmailAuditErrorCode = 'network' | 'unauthorized' | 'notFound' | 'validation' | 'failed'

export class EmailAuditError extends Error {
  readonly code: EmailAuditErrorCode

  constructor(code: EmailAuditErrorCode) {
    super(code)
    this.code = code
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch {
    throw new EmailAuditError('network')
  }
  if (response.status === 401) throw new EmailAuditError('unauthorized')
  if (response.status === 404) throw new EmailAuditError('notFound')
  if (response.status === 422) throw new EmailAuditError('validation')
  if (!response.ok) throw new EmailAuditError('failed')
  try {
    return (await response.json()) as T
  } catch {
    throw new EmailAuditError('failed')
  }
}

export function listEmailDeliveries(
  accessToken: string,
  page: number,
  status: DeliveryStatus | '',
  kind: DeliveryKind | '',
  fromDate = '',
  toDate = '',
): Promise<EmailDeliveryPage> {
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  if (kind) query.set('kind', kind)
  if (fromDate) query.set('from', fromDate)
  if (toDate) query.set('to', toDate)
  return getJson(`${apiBaseUrl}/api/email-deliveries?${query}`, accessToken)
}

export function getEmailDelivery(accessToken: string, id: string): Promise<EmailDeliveryDetail> {
  return getJson(`${apiBaseUrl}/api/email-deliveries/${encodeURIComponent(id)}`, accessToken)
}
