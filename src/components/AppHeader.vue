<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import AppIcon, { type IconName } from './AppIcon.vue'
import { useSettingsStore } from '@/stores/settings'
import { useItemsStore } from '@/stores/items'
import { isReached } from '@/lib/clamp'
import type { ThemePreference } from '@/lib/theme'
import { LOGO_URL } from '@/lib/assets'

/**
 * The top bar: logo, the jar tabs (default slot) and the actions. With no jars yet there are
 * no tabs, so the app name is shown instead.
 */
defineProps<{ showTitle?: boolean }>()
const emit = defineEmits<{ export: []; import: []; about: [] }>()

const settings = useSettingsStore()
const items = useItemsStore()

// ─── Hide done filter ───────────────────────────────────────────────────────
const doneCount = computed(() => items.items.filter((i) => isReached(i.count, i.target)).length)
const filterLabel = computed(() =>
  settings.hideDone ? `Show done items (${doneCount.value} hidden)` : 'Hide done items',
)
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

const themeOptions: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]

function menuItems(): HTMLElement[] {
  return Array.from(
    menu.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ??
      [],
  )
}

onClickOutside(root, () => (open.value = false))

async function openMenu(focus: 'first' | 'last' = 'first') {
  open.value = true
  await nextTick()
  const items = menuItems()
  const checked = items.find((el) => el.getAttribute('aria-checked') === 'true')
  ;(focus === 'last' ? items.at(-1) : (checked ?? items[0]))?.focus()
}

function closeMenu(returnFocus = true) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function toggle() {
  if (open.value) closeMenu()
  else void openMenu()
}

function onMenuKeydown(e: KeyboardEvent) {
  const items = menuItems()
  const index = items.indexOf(document.activeElement as HTMLElement)
  const move = (to: number) => items[(to + items.length) % items.length]?.focus()
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(index + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(index - 1)
      break
    case 'Home':
      e.preventDefault()
      move(0)
      break
    case 'End':
      e.preventDefault()
      move(items.length - 1)
      break
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      closeMenu(false)
      break
  }
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    void openMenu(e.key === 'ArrowUp' ? 'last' : 'first')
  }
}

function pick(action: 'export' | 'import' | 'about') {
  closeMenu()
  if (action === 'export') emit('export')
  else if (action === 'import') emit('import')
  else emit('about')
}
</script>

<template>
  <header class="app-header">
    <h1 class="brand">
      <img class="brand__logo" :src="LOGO_URL" alt="" width="32" height="32" />
      <span :class="{ 'visually-hidden': !showTitle }">Tallyjar</span>
    </h1>

    <div class="middle">
      <slot />
    </div>

    <div class="actions">
      <button
        v-if="items.items.length"
        class="icon-button filter"
        :class="{ 'filter--on': settings.hideDone }"
        type="button"
        :aria-label="filterLabel"
        :title="filterLabel"
        :aria-pressed="settings.hideDone"
        @click="settings.setHideDone(!settings.hideDone)"
      >
        <AppIcon name="funnel" :size="22" />
        <span
          v-if="settings.hideDone && doneCount"
          class="filter__badge tabular"
          aria-hidden="true"
        >
          {{ doneCount > 99 ? '99+' : doneCount }}
        </span>
      </button>

      <div ref="root" class="menu-wrap">
        <button
          ref="trigger"
          class="icon-button"
          type="button"
          aria-label="Menu"
          aria-haspopup="menu"
          :aria-expanded="open"
          aria-controls="app-menu"
          @click="toggle"
          @keydown="onTriggerKeydown"
        >
          <AppIcon name="menu" :size="24" />
        </button>

        <Transition name="pop">
          <div
            v-show="open"
            id="app-menu"
            ref="menu"
            class="menu"
            role="menu"
            aria-label="App menu"
            @keydown="onMenuKeydown"
          >
            <button
              class="menu__item"
              role="menuitem"
              type="button"
              tabindex="-1"
              @click="pick('export')"
            >
              <AppIcon name="download" /> Export backup
            </button>
            <button
              class="menu__item"
              role="menuitem"
              type="button"
              tabindex="-1"
              @click="pick('import')"
            >
              <AppIcon name="upload" /> Import backup
            </button>

            <div class="menu__sep" role="separator" />
            <div role="group" aria-labelledby="theme-label">
              <div id="theme-label" class="menu__label">Theme</div>
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                class="menu__item"
                role="menuitemradio"
                type="button"
                tabindex="-1"
                :aria-checked="settings.theme === opt.value"
                @click="settings.setTheme(opt.value)"
              >
                <AppIcon :name="opt.icon" /> {{ opt.label }}
                <AppIcon
                  v-if="settings.theme === opt.value"
                  class="menu__check"
                  name="check"
                  :size="18"
                />
              </button>
            </div>

            <div class="menu__sep" role="separator" />
            <button
              class="menu__item"
              role="menuitem"
              type="button"
              tabindex="-1"
              @click="pick('about')"
            >
              <AppIcon name="info" /> About
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: calc(var(--space-2) + env(safe-area-inset-top)) var(--space-3) var(--space-2)
    var(--space-4);
}

.middle {
  flex: 1;
  min-width: 0;
}

.brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.brand__logo {
  border-radius: 8px;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.menu-wrap {
  position: relative;
}

.filter {
  position: relative;
  color: var(--color-text-muted);
}

.filter--on {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.filter--on:hover {
  background: color-mix(in srgb, var(--color-primary) 85%, var(--color-text));
}

.filter__badge {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 2px solid var(--color-bg);
  border-radius: var(--radius-pill);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 0.6875rem;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-1));
  min-width: 220px;
  padding: var(--space-2);
  border: var(--border-card);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
  transform-origin: top right;
}

.menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
}

.menu__item:hover,
.menu__item:focus-visible {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.menu__item[aria-disabled='true'] {
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.menu__item[aria-disabled='true']:hover {
  background: transparent;
}

.menu__check {
  margin-left: auto;
  color: var(--color-primary);
}

.menu__label {
  padding: var(--space-1) var(--space-3);
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.menu__sep {
  height: 1px;
  margin: var(--space-2) var(--space-1);
  background: var(--color-border);
}

@media (prefers-reduced-motion: no-preference) {
  .pop-enter-active,
  .pop-leave-active {
    transition:
      opacity var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }
  .pop-enter-from,
  .pop-leave-to {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
}
</style>
