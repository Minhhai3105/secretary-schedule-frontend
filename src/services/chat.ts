import type { Schedule } from './schedules'
import responseFormat from '../contracts/chat-response-format.json' with { type: 'json' }

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

export interface ChatHistoryItem extends ChatTurn {
  id: string
  created_at_utc: string
  schedules: Schedule[]
  proposal: ChatProposal | null
  proposal_state: 'pending' | 'confirmed' | 'cancelled' | 'stale' | null
}

export interface ChatHistoryPage {
  messages: ChatHistoryItem[]
  next_cursor: string | null
}

type ChatErrorCode = 'network' | 'unauthorized' | 'notFound' | 'conflict' | 'validation' | 'failed'

export class ChatError extends Error {
  readonly code: ChatErrorCode

  constructor(code: ChatErrorCode) {
    super(code)
    this.code = code
  }
}

const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL ?? (typeof window !== 'undefined' ? `http://${window.location.hostname}:8000` : 'http://localhost:8000')

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
  if (response.status === 400 || response.status === 422) throw new ChatError('validation')
  if (!response.ok) throw new ChatError('failed')
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ChatError('failed')
  }
}

export async function listChatMessages(accessToken: string, cursor?: string): Promise<ChatHistoryPage> {
  const params = new URLSearchParams({ limit: '20' })
  if (cursor) params.set('cursor', cursor)
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/chat/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new ChatError('network')
  }
  if (response.status === 401) throw new ChatError('unauthorized')
  if (!response.ok) throw new ChatError('failed')
  try {
    return (await response.json()) as ChatHistoryPage
  } catch {
    throw new ChatError('failed')
  }
}

export async function sendChatMessage(accessToken: string, message: string): Promise<ChatMessageResponse> {
  const completion = await post<{
    object: string
    choices: { finish_reason: string; message: { role: string; content: string } }[]
  }>(accessToken, '/v1/chat/completions', {
    model: 'secretary-schedule',
    messages: [{ role: 'user', content: message }],
    stream: false,
    response_format: responseFormat,
  })
  try {
    const choice = completion.choices?.[0]
    if (completion.object !== 'chat.completion' || completion.choices.length !== 1
      || choice?.finish_reason !== 'stop' || choice.message.role !== 'assistant'
      || typeof choice.message.content !== 'string') throw new Error('Invalid completion')
    const payload = JSON.parse(choice.message.content)
    if (typeof payload.answer !== 'string' || !Array.isArray(payload.schedules)
      || (payload.proposal !== null && (typeof payload.proposal !== 'object'
        || !Array.isArray(payload.proposal.proposed_data)))) throw new Error('Invalid chat content')
    let proposal: ChatProposal | null = null
    if (payload.proposal !== null) {
      const data: Record<string, unknown> = {}
      const allowed = new Set<string>(responseFormat.json_schema.schema.$defs.ProposalField.properties.field.enum)
      for (const item of payload.proposal.proposed_data) {
        if (!item || !allowed.has(item.field) || Object.hasOwn(data, item.field)
          || (item.value !== null && typeof item.value !== 'string')) throw new Error('Invalid proposal field')
        data[item.field] = item.value
      }
      proposal = { ...payload.proposal, proposed_data: data }
    }
    return { answer: payload.answer, schedules: payload.schedules, proposal }
  } catch {
    throw new ChatError('failed')
  }
}

export function confirmChatProposal(accessToken: string, id: string): Promise<{ schedule: Schedule }> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/confirm`)
}

export function cancelChatProposal(accessToken: string, id: string): Promise<void> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/cancel`)
}
