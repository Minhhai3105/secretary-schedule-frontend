import type { Schedule } from './schedules'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatProposal {
  id: string
  action: 'create' | 'update' | 'cancel'
  schedule_id: string | null
  schedule_version: number | null
  proposed_data: Record<string, unknown>
  expires_at_utc: string
}

export interface ChatMessageResponse {
  answer: string
  schedules: Schedule[]
  proposal: ChatProposal | null
}

type ChatErrorCode = 'network' | 'unauthorized' | 'notFound' | 'conflict' | 'validation' | 'failed'

export class ChatError extends Error {
  readonly code: ChatErrorCode

  constructor(code: ChatErrorCode) {
    super(code)
    this.code = code
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

async function post<T>(accessToken: string, path: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new ChatError('network')
  }

  if (response.status === 401) throw new ChatError('unauthorized')
  if (response.status === 404) throw new ChatError('notFound')
  if (response.status === 409) throw new ChatError('conflict')
  if (response.status === 422) throw new ChatError('validation')
  if (!response.ok) throw new ChatError('failed')
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ChatError('failed')
  }
}

export function sendChatMessage(accessToken: string, message: string, history: ChatTurn[]): Promise<ChatMessageResponse> {
  return post(accessToken, '/api/chat/messages', { message, history: history.slice(-5) })
}

export function confirmChatProposal(accessToken: string, id: string): Promise<{ schedule: Schedule }> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/confirm`)
}

export function cancelChatProposal(accessToken: string, id: string): Promise<void> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/cancel`)
}
