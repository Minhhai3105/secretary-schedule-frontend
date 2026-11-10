<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  id: string
  label: string
  modelValue: string
  autocomplete: string
  disabled?: boolean
  minlength?: number
  maxlength?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const visible = ref(false)

function updateValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <label class="form-label" :for="props.id">{{ props.label }}</label>
  <div class="input-group">
    <input :id="props.id" class="form-control" :type="visible ? 'text' : 'password'"
      :value="props.modelValue" :autocomplete="props.autocomplete" :disabled="props.disabled"
      :minlength="props.minlength" :maxlength="props.maxlength" required @input="updateValue" />
    <button class="btn btn-outline-secondary" type="button" :disabled="props.disabled"
      :aria-label="`${visible ? 'Ẩn' : 'Hiện'} ${props.label.toLowerCase()}`"
      :aria-pressed="visible" :aria-controls="props.id" @click="visible = !visible">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        <path v-if="visible" d="M4 4 20 20" />
      </svg>
    </button>
  </div>
</template>
