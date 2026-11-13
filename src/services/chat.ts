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
  const choice = completion.choices?.[0]
  if (completion.object !== 'chat.completion' || completion.choices?.length !== 1
    || choice?.finish_reason !== 'stop' || choice.message.role !== 'assistant'
    || typeof choice.message.content !== 'string') throw new ChatError('failed')
  return parseChatContent(choice.message.content)
}

function parseChatContent(content: string): ChatMessageResponse {
  try {
    const payload = JSON.parse(content)
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

// Only the root answer is rendered before the complete JSON has been validated.
function partialAnswer(content: string): string {
  const prefix = '{"answer":"'
  if (!content.startsWith(prefix)) return ''
  let end = prefix.length
  for (let pos = end; pos < content.length;) {
    if (content[pos] === '"') return JSON.parse(content.slice(prefix.length - 1, pos + 1))
    if (content[pos] === '\\') {
      const width = content[pos + 1] === 'u' ? 6 : 2
      if (pos + width > content.length) break
      pos += width
    } else pos++
    end = pos
  }
  const value: string = JSON.parse(content.slice(prefix.length - 1, end) + '"')
  const last = value.charCodeAt(value.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value
}

export async function streamChatMessage(
  accessToken: string, message: string, onAnswer: (answer: string) => void, signal?: AbortSignal,
): Promise<ChatMessageResponse> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 180_000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ model: 'secretary-schedule', messages: [{ role: 'user', content: message }],
        stream: true, response_format: responseFormat }),
    })
    if (response.status === 401) throw new ChatError('unauthorized')
    if (response.status === 400 || response.status === 422) throw new ChatError('validation')
    if (!response.ok) throw new ChatError('failed')
    if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new ChatError('failed')
    reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let buffer = ''
    let content = ''
    let completionId: string | undefined
    let finished = false
    let bytes = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) throw new ChatError('failed') // EOF without [DONE] is never success.
      bytes += value.byteLength
      if (bytes > 1_000_000) throw new ChatError('failed')
      buffer += decoder.decode(value, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, '')).join('\n')
        if (!data) continue
        if (data === '[DONE]') {
          if (!finished) throw new ChatError('failed')
          return parseChatContent(content)
        }
        const event = JSON.parse(data)
        if (event.error || event.object !== 'chat.completion.chunk' || typeof event.id !== 'string'
          || event.model !== 'secretary-schedule' || event.choices?.length !== 1) throw new ChatError('failed')
        completionId ??= event.id
        if (event.id !== completionId || finished) throw new ChatError('failed')
        const choice = event.choices[0]
        if (choice.index !== 0 || !choice.delta || choice.delta.refusal
          || (choice.delta.role && choice.delta.role !== 'assistant')) throw new ChatError('failed')
        if (choice.delta.content !== undefined) {
          if (typeof choice.delta.content !== 'string') throw new ChatError('failed')
          content += choice.delta.content
          onAnswer(partialAnswer(content))
        }
        if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
          if (choice.finish_reason !== 'stop') throw new ChatError('failed')
          finished = true
        }
      }
    }
  } catch (cause) {
    if (cause instanceof ChatError) throw cause
    throw new ChatError(cause instanceof SyntaxError ? 'failed' : 'network')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    await reader?.cancel().catch(() => {})
    reader?.releaseLock()
    controller.abort()
  }
}

export function confirmChatProposal(accessToken: string, id: string): Promise<{ schedule: Schedule }> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/confirm`)
}

export function cancelChatProposal(accessToken: string, id: string): Promise<void> {
  return post(accessToken, `/api/chat/proposals/${encodeURIComponent(id)}/cancel`)
}
