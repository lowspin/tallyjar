<script setup lang="ts">
import { useId } from 'vue'

/** A text field for whole numbers. Text input with a numeric keyboard, so "1,250" is allowed. */
defineProps<{
  label: string
  error?: string
  hint?: string
  placeholder?: string
  autofocus?: boolean
}>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ input: [] }>()

const id = useId()
const messageId = useId()
</script>

<template>
  <div class="field">
    <label class="field__label" :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="value"
      class="input tabular"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      enterkeyhint="done"
      :placeholder="placeholder"
      :autofocus="autofocus"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? messageId : undefined"
      @input="emit('input')"
    />
    <p v-if="error" :id="messageId" class="field__error">{{ error }}</p>
    <p v-else-if="hint" :id="messageId" class="field__hint">{{ hint }}</p>
    <slot />
  </div>
</template>
