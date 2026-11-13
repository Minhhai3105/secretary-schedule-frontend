import type { Schedule } from './schedules'
import { loadChatSdk } from './chat-sdk-loader.ts'

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

export type ChatErrorCode = 'network' | 'unauthorized' | 'notFound' | 'conflict' | 'validation' | 'unavailable' | 'failed'

export class ChatError extends Error {
  readonly code: ChatErrorCode

  constructor(code: ChatErrorCode) {
    super(code)
    this.code = code
  }
}

export const chatApiBaseUrl = import.meta.env?.VITE_API_BASE_URL
  ?? (typeof window !== 'undefined' ? `http://${window.location.hostname}:8000` : 'http://localhost:8000')
const apiBaseUrl = chatApiBaseUrl

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

export interface CompletionContent {
  answer: string
  schedules: Schedule[]
  proposal: (Omit<ChatProposal, 'proposed_data'> & {
    proposed_data: { field: string; value: string | null }[]
  }) | null
}

// The SDK validates the generated response schema before this business adapter runs.
function adaptChatContent(value: CompletionContent): ChatMessageResponse {
  if (!value.proposal) return { ...value, proposal: null }
  const data: Record<string, unknown> = {}
  for (const item of value.proposal.proposed_data) {
    if (Object.hasOwn(data, item.field)) throw new ChatError('failed')
    data[item.field] = item.value
  }
  return { ...value, proposal: { ...value.proposal, proposed_data: data } }
}

export async function sendChatMessage(accessToken: string, message: string): Promise<ChatMessageResponse> {
  return loadChatSdk().catch(() => { throw new ChatError('network') }).then(async sdk => {
    try { return adaptChatContent(await sdk.generateBackendChat(accessToken, message)) }
    catch (cause) { throw cause instanceof ChatError ? cause : new ChatError(sdk.backendFailureCode(cause)) }
  })
}

export async function streamChatMessage(
  accessToken: string, message: string, onAnswer: (answer: string) => void, signal?: AbortSignal,
): Promise<ChatMessageResponse> {
  return loadChatSdk().catch(() => { throw new ChatError('network') }).then(async sdk => {
    try { return adaptChatContent(await sdk.streamBackendChat(accessToken, message, onAnswer, signal)) }
    catch (cause) { throw cause instanceof ChatError ? cause : new ChatError(sdk.backendFailureCode(cause)) }
  })
}

export function confirmChatProposal(accessToken: string, id: string): Promise<{ schedule: Schedule }> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/confirm`)
}

export function cancelChatProposal(accessToken: string, id: string): Promise<void> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/cancel`)
}
