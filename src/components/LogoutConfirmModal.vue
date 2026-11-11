<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ open: boolean; loggingOut: boolean }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
const { t } = useI18n({ useScope: 'global' })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && !props.loggingOut) {
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="props.open" class="workspace-modal-backdrop" role="dialog" aria-modal="true"
    aria-labelledby="logout-confirm-title" @click.self="!props.loggingOut && emit('close')">
    <div class="workspace-modal">
      <h2 id="logout-confirm-title">{{ t('session.logoutConfirmTitle') }}</h2>
      <p>{{ t('session.logoutConfirmDescription') }}</p>
      <div class="workspace-modal-actions">
        <button class="btn btn-outline-secondary px-4" type="button" :disabled="props.loggingOut"
          @click="emit('close')">
          {{ t('session.staySignedIn') }}
        </button>
        <button class="btn btn-primary px-4" type="button" :disabled="props.loggingOut"
          @click="emit('confirm')">
          {{ t(props.loggingOut ? 'session.loggingOut' : 'session.logout') }}
        </button>
      </div>
    </div>
  </div>
</template>
