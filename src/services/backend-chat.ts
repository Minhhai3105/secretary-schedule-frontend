import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { APICallError, generateText, jsonSchema, Output, streamText } from 'ai'
import { z } from 'zod'
import responseFormat from '../contracts/chat-response-format.json' with { type: 'json' }
import { chatApiBaseUrl, type ChatErrorCode, type CompletionContent } from './chat.ts'
import { i18n } from '../i18n/index.ts'

const contentValidator = z.fromJSONSchema(
  responseFormat.json_schema.schema as Parameters<typeof z.fromJSONSchema>[0],
)

// The SDK parses SSE. This guard enforces the application's size/terminal-marker contract:
// the SDK itself accepts EOF after a stop chunk even when [DONE] is missing.
function boundedCompletionStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let tail = ''
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > 1_000_000) throw new Error(i18n.global.t('chat.streamTooLarge'))
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-64)
      controller.enqueue(chunk)
    },
    flush() {
      tail += decoder.decode()
      if (!/(?:^|\r?\n)data: ?\[DONE\]\r?\n\r?\n$/.test(tail)) {
        throw new Error(i18n.global.t('chat.streamMissingDone'))
      }
    },
  }))
}

function backendChatModel(accessToken: string) {
  const provider = createOpenAICompatible({
    name: 'backend', baseURL: `${chatApiBaseUrl.replace(/\/$/, '')}/v1`,
    supportsStructuredOutputs: true, includeUsage: false,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      const response = await fetch(url, { ...init, headers })
      if (!response.ok || !response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
        return response
      }
      return new Response(boundedCompletionStream(response.body), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      })
    },
  })
  return provider('secretary-schedule')
}


function completionOutput() {
  return Output.object({
    name: responseFormat.json_schema.name,
    schema: jsonSchema<CompletionContent>(
      responseFormat.json_schema.schema as Parameters<typeof jsonSchema>[0],
      { validate: (value) => {
        const result = contentValidator.safeParse(value)
        return result.success ? { success: true, value: result.data as CompletionContent }
          : { success: false, error: new Error('Invalid schedule assistant content') }
      } },
    ),
  })
}

export function backendFailureCode(cause: unknown): ChatErrorCode {
  if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ai_unavailable') {
    return 'unavailable'
  }
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 503) return 'unavailable'
    if (cause.statusCode === 401) return 'unauthorized'
    if (cause.statusCode === 404) return 'notFound'
    if (cause.statusCode === 409) return 'conflict'
    if (cause.statusCode === 400 || cause.statusCode === 422) return 'validation'
    if (cause.statusCode === undefined) return 'network'
  }
  if (cause instanceof DOMException && cause.name === 'AbortError') return 'network'
  return 'failed'
}

export async function generateBackendChat(accessToken: string, message: string): Promise<CompletionContent> {
  const result = await generateText({
    model: backendChatModel(accessToken), messages: [{ role: 'user', content: message }],
    output: completionOutput(), maxRetries: 0, timeout: 180_000,
    providerOptions: { backend: { strictJsonSchema: true } },
  })
  if (result.finishReason !== 'stop') throw new Error('Incomplete completion')
  return result.output
}

export async function streamBackendChat(
  accessToken: string, message: string, onAnswer: (answer: string) => void, signal?: AbortSignal,
): Promise<CompletionContent> {
  let streamError: unknown
  try {
    const result = streamText({
      model: backendChatModel(accessToken), messages: [{ role: 'user', content: message }],
      output: completionOutput(), abortSignal: signal, timeout: 180_000,
      maxRetries: 0, streamRetries: 0,
      providerOptions: { backend: { strictJsonSchema: true } },
      onError: ({ error }) => { streamError ??= error },
    })
    let displayed = ''
    for await (const partial of result.partialOutputStream) {
      if (typeof partial.answer !== 'string') continue
      // Partial JSON repair can temporarily end between a UTF-16 surrogate pair.
      const last = partial.answer.charCodeAt(partial.answer.length - 1)
      const answer = last >= 0xd800 && last <= 0xdbff ? partial.answer.slice(0, -1) : partial.answer
      if (answer !== displayed) { displayed = answer; onAnswer(answer) }
    }
    if (streamError) throw streamError
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (await result.finishReason !== 'stop') throw new Error('Incomplete completion')
    return await result.output
  } catch (cause) { throw streamError ?? cause }
}
