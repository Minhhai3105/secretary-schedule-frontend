<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import {
  cancelChatProposal, ChatError, confirmChatProposal, listChatMessages, streamChatMessage,
  type ChatHistoryItem, type ChatProposal, type ChatTurn,
} from '../services/chat'
import { getSchedule, ScheduleLoadError, type Schedule } from '../services/schedules'
import { isSelf } from '../utils/relatedPerson'

type ProposalState = 'pending' | 'confirmed' | 'cancelled' | 'stale' | 'uncertain'
interface Message extends ChatTurn {
  id: string
  schedules?: Schedule[]
  proposal?: ChatProposal | null
  proposalState?: ProposalState
  proposalErrorKey?: string
  confirmedSchedule?: Schedule
  interrupted?: boolean
  targetSchedule?: Schedule | null
}

const props = defineProps<{ session: LoginResult }>()
const emit = defineEmits<{
  openSchedule: [scheduleId: string]
  editCreate: [initialData: Record<string, unknown>]
  editUpdate: [schedule: Schedule, overrides: Record<string, unknown>]
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
  scheduleChanged: []
}>()
const { locale, t } = useI18n({ useScope: 'global' })
const isOpen = ref(false)
const hasUnread = ref(false)
const messages = ref<Message[]>([])
const historyCursor = ref<string | null>(null)
const historyLoaded = ref(false)
const loadingHistory = ref(false)
const historyErrorKey = ref('')
const draft = ref('')
const sending = ref(false)
const processing = ref(false)
const sendErrorKey = ref('')
const nowMs = ref(Date.now())
const chatLogRef = ref<HTMLElement | null>(null)
const messageInputRef = ref<HTMLTextAreaElement | null>(null)
let expiryTimer: ReturnType<typeof setInterval> | undefined
let localMessageId = 0
let sendController: AbortController | undefined
const starterKeys = ['chat.suggestions.today', 'chat.suggestions.week', 'chat.suggestions.create']
const pendingProposal = computed(() => messages.value.some((item) =>
  item.proposal && item.proposalState === 'pending' && !isExpired(item.proposal)))

function isExpired(proposal: ChatProposal): boolean {
  return Date.parse(proposal.expires_at_utc) <= nowMs.value
}

function scrollToBottom() {
  void nextTick(() => {
    const el = chatLogRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function openChat() {
  isOpen.value = true
  hasUnread.value = false
  if (!historyLoaded.value) void loadHistory(true)
  scrollToBottom()
  void nextTick(() => {
    if (!sending.value && !processing.value && !pendingProposal.value) {
      messageInputRef.value?.focus()
    }
  })
}

function restoredMessage(item: ChatHistoryItem): Message {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    schedules: item.schedules,
    proposal: item.proposal,
    proposalState: item.proposal_state ?? undefined,
  }
}

async function loadHistory(firstPage = false) {
  if (loadingHistory.value) return
  loadingHistory.value = true
  historyErrorKey.value = ''
  const cursor = firstPage ? undefined : historyCursor.value ?? undefined
  const log = chatLogRef.value
  const previousHeight = log?.scrollHeight ?? 0
  const previousTop = log?.scrollTop ?? 0
  try {
    const page = await authorized((token) => listChatMessages(token, cursor))
    const older = page.messages.slice().reverse().map(restoredMessage)
    messages.value = firstPage ? older : [...older, ...messages.value]
    historyCursor.value = page.next_cursor
    historyLoaded.value = true
    await nextTick()
    if (firstPage) scrollToBottom()
    else if (log) log.scrollTop = log.scrollHeight - previousHeight + previousTop
  } catch (cause) {
    if (cause instanceof ChatError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if ((cause instanceof ChatError && cause.code === 'network')
      || (cause instanceof AuthError && cause.code === 'restoreNetwork')) {
      historyErrorKey.value = 'chat.historyNetworkError'
    } else {
      historyErrorKey.value = 'chat.historyLoadError'
    }
  } finally {
    loadingHistory.value = false
  }
}

function closeChat() {
  isOpen.value = false
}

function toggleChat() {
  if (isOpen.value) closeChat()
  else openChat()
}

function openScheduleFromChat(scheduleId: string) {
  isOpen.value = false
  emit('openSchedule', scheduleId)
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat(locale.value === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

function formatFieldValue(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return t('chat.notProvided')
  if ((key === 'starts_at_utc' || key === 'ends_at_utc') && typeof raw === 'string') return dateTimeLabel(raw)
  if (key === 'meeting_mode' && (raw === 'online' || raw === 'offline')) return t(`week.${raw}`)
  if (key === 'related_person' && typeof raw === 'string' && isSelf(raw)) return t('week.me')
  return String(raw)
}

function proposalFields(
  proposal: ChatProposal,
  targetSchedule?: Schedule | null,
): { label: string; oldValue?: string; value: string }[] {
  const keys = ['title', 'starts_at_utc', 'ends_at_utc', 'meeting_mode', 'location', 'meeting_url', 'related_person', 'preparation', 'notes']
  return keys.filter((key) => Object.hasOwn(proposal.proposed_data, key)).map((key) => {
    const value = formatFieldValue(key, proposal.proposed_data[key])
    const oldValue = proposal.action === 'update' && targetSchedule
      ? formatFieldValue(key, targetSchedule[key as keyof Schedule])
      : undefined
    return { label: t(`chat.field.${key}`), oldValue, value }
  })
}

async function fetchTargetSchedule(scheduleId: string): Promise<Schedule | null> {
  try {
    return await getSchedule(props.session.access_token, scheduleId)
  } catch (cause) {
    if (cause instanceof ScheduleLoadError && cause.code === 'unauthorized') {
      try {
        const renewed = await refreshSession()
        if (renewed) {
          emit('sessionUpdated', renewed)
          return await getSchedule(renewed.access_token, scheduleId)
        }
      } catch {
        return null
      }
    }
    return null
  }
}

async function authorized<T>(run: (accessToken: string) => Promise<T>): Promise<T> {
  try {
    return await run(props.session.access_token)
  } catch (cause) {
    if (!(cause instanceof ChatError) || cause.code !== 'unauthorized') throw cause
    const renewed = await refreshSession()
    if (!renewed) throw new ChatError('unauthorized')
    emit('sessionUpdated', renewed)
    return run(renewed.access_token)
  }
}

async function send() {
  const message = draft.value.trim()
  if (!historyLoaded.value || sending.value || processing.value || pendingProposal.value || !message) return
  sending.value = true
  sendErrorKey.value = ''
  sendController = new AbortController()
  const signal = sendController.signal
  const userId = `local-${++localMessageId}`
  const assistantId = `local-${++localMessageId}`
  messages.value.push({ id: userId, role: 'user', content: message })
  messages.value.push({ id: assistantId, role: 'assistant', content: '' })
  scrollToBottom()
  try {
    const response = await authorized((token) => streamChatMessage(token, message, (answer) => {
      const item = messages.value.find((entry) => entry.id === assistantId)
      if (item) item.content = answer
      scrollToBottom()
    }, signal))
    let targetSchedule: Schedule | null = null
    if (response.proposal?.schedule_id) {
      targetSchedule = await fetchTargetSchedule(response.proposal.schedule_id)
    }
    const item = messages.value.find((entry) => entry.id === assistantId)
    if (item) Object.assign(item, {
      content: response.answer, schedules: response.schedules,
      proposal: response.proposal, proposalState: response.proposal ? 'pending' : undefined, targetSchedule,
    })
    if (!isOpen.value) hasUnread.value = true
    draft.value = ''
    scrollToBottom()
  } catch (cause) {
    if (signal.aborted) return
    const item = messages.value.find((entry) => entry.id === assistantId)
    if (item) item.interrupted = true
    // A disconnected response may already be saved. Reload before any manual retry.
    historyLoaded.value = false
    historyErrorKey.value = 'chat.streamInterrupted'
    if (cause instanceof ChatError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if ((cause instanceof ChatError && cause.code === 'network')
      || (cause instanceof AuthError && cause.code === 'restoreNetwork')) {
      sendErrorKey.value = 'chat.networkError'
    } else if (cause instanceof ChatError && cause.code === 'validation') {
      sendErrorKey.value = 'chat.validationError'
    } else {
      sendErrorKey.value = 'chat.sendError'
    }
  } finally {
    sendController = undefined
    sending.value = false
  }
}

function useStarterPrompt(promptKey: string) {
  if (sending.value || processing.value || pendingProposal.value) return
  draft.value = t(promptKey)
  void send()
}

function onMessageKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

async function processProposal(item: Message, action: 'confirm' | 'cancel') {
  const proposal = item.proposal
  if (!proposal || item.proposalState !== 'pending' || isExpired(proposal) || processing.value) return
  processing.value = true
  item.proposalErrorKey = ''
  try {
    if (action === 'confirm') {
      const result = await authorized((token) => confirmChatProposal(token, proposal.id))
      item.confirmedSchedule = result.schedule
      item.proposalState = 'confirmed'
      emit('scheduleChanged')
    } else {
      await authorized((token) => cancelChatProposal(token, proposal.id))
      item.proposalState = 'cancelled'
    }
  } catch (cause) {
    if (cause instanceof ChatError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if ((cause instanceof ChatError && cause.code === 'network')
      || (cause instanceof AuthError && cause.code === 'restoreNetwork')) {
      item.proposalState = 'uncertain'
      item.proposalErrorKey = 'chat.uncertainError'
    } else if (cause instanceof ChatError && ['conflict', 'notFound', 'validation'].includes(cause.code)) {
      item.proposalState = 'stale'
      item.proposalErrorKey = 'chat.staleError'
    } else {
      item.proposalErrorKey = 'chat.actionError'
    }
  } finally {
    processing.value = false
    scrollToBottom()
  }
}

async function editProposal(item: Message) {
  const proposal = item.proposal
  if (!proposal || item.proposalState !== 'pending' || isExpired(proposal) || processing.value) return
  processing.value = true
  item.proposalErrorKey = ''
  try {
    let target = item.targetSchedule ?? null
    if (proposal.action === 'update') {
      if (!proposal.schedule_id) {
        item.proposalErrorKey = 'chat.staleError'
        return
      }
      if (!target) {
        target = await fetchTargetSchedule(proposal.schedule_id)
        item.targetSchedule = target
      }
      if (!target) {
        item.proposalErrorKey = 'chat.staleError'
        return
      }
    }
    try {
      await authorized((token) => cancelChatProposal(token, proposal.id))
    } catch (cause) {
      if (cause instanceof ChatError && cause.code === 'unauthorized') {
        emit('sessionExpired')
        return
      }
      if (!(cause instanceof ChatError) || !['conflict', 'notFound'].includes(cause.code)) {
        item.proposalErrorKey = 'chat.actionError'
        return
      }
    }
    item.proposalState = 'cancelled'
    isOpen.value = false
    if (proposal.action === 'create') {
      emit('editCreate', { ...proposal.proposed_data })
    } else if (proposal.action === 'update' && target) {
      emit('editUpdate', target, { ...proposal.proposed_data })
    }
  } finally {
    processing.value = false
  }
}

onMounted(() => { expiryTimer = setInterval(() => { nowMs.value = Date.now() }, 15000) })
onUnmounted(() => {
  if (expiryTimer) clearInterval(expiryTimer)
  sendController?.abort()
})
</script>

<template>
  <aside class="chat-widget" :aria-label="t('chat.title')" @keydown.esc="closeChat">
    <section v-show="isOpen" id="floating-chat-panel" class="chat-floating-panel"
      role="dialog" :aria-modal="false" :aria-label="t('chat.title')">
      <header class="chat-floating-header">
        <div class="chat-floating-title">
          <span class="chat-floating-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" />
            </svg>
          </span>
          <div>
            <h2>{{ t('chat.title') }}</h2>
            <p>{{ t('chat.subtitle') }}</p>
          </div>
        </div>
        <button class="chat-floating-close" type="button"
          :aria-label="t('chat.minimize')" :title="t('chat.minimize')" @click="closeChat">
          <span aria-hidden="true">−</span>
        </button>
      </header>
      <p class="chat-floating-privacy" role="note">{{ t('chat.privacy') }}</p>

      <div ref="chatLogRef" class="workspace-chat-log chat-floating-log" aria-live="polite">
        <button v-if="historyCursor && !loadingHistory" class="btn btn-link btn-sm" type="button"
          :disabled="sending || processing" @click="loadHistory()">{{ t('chat.loadOlder') }}</button>
        <p v-if="loadingHistory" class="workspace-meta small" role="status">{{ t('chat.loadingHistory') }}</p>
        <div v-if="historyErrorKey" class="alert alert-warning small" role="alert">
          {{ t(historyErrorKey) }}
          <button class="btn btn-link btn-sm" type="button" :disabled="sending || processing"
            @click="loadHistory(!historyLoaded)">{{ t('common.retry') }}</button>
        </div>
        <div v-if="historyLoaded && messages.length === 0" class="workspace-chat-empty">
          <p class="mb-0">{{ t('chat.empty') }}</p>
          <div class="workspace-chat-chips">
            <button v-for="promptKey in starterKeys" :key="promptKey" class="workspace-chat-chip"
              type="button" :disabled="sending || processing || pendingProposal"
              @click="useStarterPrompt(promptKey)">
              {{ t(promptKey) }}
            </button>
          </div>
        </div>
        <div v-for="item in messages" :key="item.id" class="d-flex"
          :class="item.role === 'user' ? 'justify-content-end' : 'justify-content-start'">
          <div :class="item.role === 'user' ? 'workspace-chat-bubble-user' : 'workspace-chat-bubble-assistant'">
            <p class="mb-0" style="white-space: pre-wrap">{{ item.content }}</p>
            <p v-if="item.interrupted" class="text-warning small mb-0">{{ t('chat.streamInterrupted') }}</p>
            <div v-if="item.schedules?.length" class="mt-3">
              <h3 class="h6">{{ t('chat.relatedSchedules') }}</h3>
              <ul class="mb-0 ps-3">
                <li v-for="schedule in item.schedules" :key="schedule.id" class="mb-1">
                  <span>{{ schedule.title }} · {{ dateTimeLabel(schedule.starts_at_utc) }}</span>
                  <button class="btn btn-link btn-sm p-0 ms-2 align-baseline" type="button"
                    @click="openScheduleFromChat(schedule.id)">
                    {{ t('chat.openSchedule') }}
                  </button>
                </li>
              </ul>
            </div>
            <div v-if="item.proposal" class="workspace-proposal-card">
              <h3 class="h6">{{ t(`chat.action.${item.proposal.action}`) }}</h3>
              <p v-if="item.targetSchedule" class="small workspace-meta mb-2">
                {{ t('chat.targetSchedule') }}: <strong>{{ item.targetSchedule.title }}</strong>
                ({{ dateTimeLabel(item.targetSchedule.starts_at_utc) }})
              </p>
              <dl v-if="proposalFields(item.proposal, item.targetSchedule).length" class="row mb-2">
                <template v-for="field in proposalFields(item.proposal, item.targetSchedule)" :key="field.label">
                  <dt class="col-sm-5">{{ field.label }}</dt>
                  <dd class="col-sm-7 text-break">
                    <template v-if="field.oldValue !== undefined">
                      <span class="workspace-meta">{{ t('chat.oldValue') }}: {{ field.oldValue }}</span>
                      <span class="mx-1">→</span>
                      <strong>{{ t('chat.newValue') }}: {{ field.value }}</strong>
                    </template>
                    <template v-else>{{ field.value }}</template>
                  </dd>
                </template>
              </dl>
              <p v-if="item.proposal.action !== 'create'" class="small workspace-meta text-break mb-2">
                {{ t('chat.scheduleId') }}: {{ item.proposal.schedule_id }}
              </p>
              <p class="small workspace-meta mb-2">{{ t('chat.expiresAt') }}: {{ dateTimeLabel(item.proposal.expires_at_utc) }}</p>
              <p v-if="item.proposalErrorKey" class="alert alert-warning small" role="alert">{{ t(item.proposalErrorKey) }}</p>
              <div v-if="item.proposalState === 'confirmed'" class="alert alert-success small mb-0 d-flex align-items-center justify-content-between gap-2 flex-wrap" role="status">
                <span>{{ item.confirmedSchedule ? t('chat.confirmed', { title: item.confirmedSchedule.title }) : t('chat.confirmedGeneric') }}</span>
                <button v-if="item.confirmedSchedule" class="btn btn-outline-success btn-sm" type="button"
                  @click="openScheduleFromChat(item.confirmedSchedule.id)">
                  {{ t('chat.openSchedule') }}
                </button>
              </div>
              <p v-else-if="item.proposalState === 'cancelled'" class="workspace-meta small mb-0">{{ t('chat.cancelled') }}</p>
              <p v-else-if="item.proposalState === 'stale'" class="workspace-meta small mb-0">{{ t('chat.expired') }}</p>
              <p v-else-if="item.proposalState === 'pending' && isExpired(item.proposal)" class="workspace-meta small mb-0">{{ t('chat.expired') }}</p>
              <div v-else-if="item.proposalState === 'pending'" class="d-flex gap-2 flex-wrap">
                <button class="btn btn-primary btn-sm" type="button" :disabled="processing" @click="processProposal(item, 'confirm')">
                  {{ t(processing ? 'chat.processing' : 'chat.confirm') }}
                </button>
                <button v-if="item.proposal.action === 'create' || item.proposal.action === 'update'"
                  class="btn btn-outline-primary btn-sm" type="button" :disabled="processing" @click="editProposal(item)">
                  {{ t('chat.editProposal') }}
                </button>
                <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="processing" @click="processProposal(item, 'cancel')">
                  {{ t('chat.cancelProposal') }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <p v-if="sending" class="workspace-meta mb-0" role="status">{{ t('chat.waiting') }}</p>
      </div>

      <div class="chat-floating-footer">
        <p v-if="pendingProposal" class="alert alert-light small py-2 px-3 mb-2" role="status">{{ t('chat.resolveProposal') }}</p>
        <div v-if="sendErrorKey" class="alert alert-warning small py-2 px-3 mb-2" role="alert">{{ t(sendErrorKey) }}</div>
        <form class="chat-floating-form" @submit.prevent="send">
          <label class="visually-hidden" for="chat-message">{{ t('chat.messageLabel') }}</label>
          <textarea id="chat-message" ref="messageInputRef" v-model="draft" class="form-control chat-floating-input"
            rows="2" maxlength="4000" :placeholder="t('chat.placeholder')"
            :disabled="!historyLoaded || sending || processing || pendingProposal" @keydown="onMessageKeydown" />
          <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mt-2">
            <small class="workspace-meta">{{ t('chat.enterHint') }}</small>
            <button class="btn btn-primary btn-sm px-3" type="submit"
              :disabled="!historyLoaded || sending || processing || pendingProposal || !draft.trim()">
              {{ t(sending ? 'chat.sending' : 'chat.send') }}
            </button>
          </div>
        </form>
      </div>
    </section>

    <button class="chat-bubble-launcher" :class="{ 'chat-bubble-launcher-open': isOpen }" type="button"
      :aria-expanded="isOpen" aria-controls="floating-chat-panel"
      :aria-label="t(isOpen ? 'chat.minimize' : 'chat.openBubble')"
      :title="t(isOpen ? 'chat.minimize' : 'chat.openBubble')"
      @click="toggleChat">
      <svg v-if="!isOpen" class="chat-bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
      <svg v-else class="chat-bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <span v-if="!isOpen && (pendingProposal || hasUnread)" class="chat-bubble-badge" aria-hidden="true">!</span>
    </button>
  </aside>
</template>
