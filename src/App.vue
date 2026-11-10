<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AboutDialog from './components/AboutDialog.vue'
import UpdateToast from './components/UpdateToast.vue'
import JarTabs from './components/JarTabs.vue'
import JarEditor from './components/editors/JarEditor.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AppIcon from './components/AppIcon.vue'
import { useSettingsStore } from './stores/settings'
import { useCollectionsStore } from './stores/collections'
import { useItemsStore } from './stores/items'
import { LOGO_URL } from './lib/assets'
import { JAR_PANEL_ID, jarTabId } from './lib/ids'
import type { Collection } from './db/types'

// Instantiate early so the theme watcher is active from the first render.
const settings = useSettingsStore()
const collections = useCollectionsStore()
const items = useItemsStore()

const aboutOpen = ref(false)
const loadError = ref(false)

// Jar editor: `editingJar` null means "new jar".
const jarEditorOpen = ref(false)
const editingJar = ref<Collection | null>(null)

function newJar() {
  editingJar.value = null
  jarEditorOpen.value = true
}

function editJar(jar: Collection) {
  editingJar.value = jar
  jarEditorOpen.value = true
}

onMounted(async () => {
  try {
    await settings.init()
    await collections.load()
  } catch (error) {
    console.error('Could not open the database', error)
    loadError.value = true
  }
})
</script>

<template>
  <div class="top">
    <AppHeader @about="aboutOpen = true" />
    <JarTabs v-if="collections.collections.length" @create="newJar" @edit="editJar" />
  </div>

  <main class="main">
    <section v-if="loadError" class="empty" role="alert">
      <img :src="LOGO_URL" alt="" width="96" height="96" />
      <h2>Couldn’t open your jars</h2>
      <p>This browser blocked access to on-device storage. Private browsing modes often do this.</p>
    </section>

    <section v-else-if="collections.loaded && !collections.collections.length" class="empty">
      <img :src="LOGO_URL" alt="" width="120" height="120" />
      <h2>Welcome to Tallyjar</h2>
      <p>Jars hold the things you count: snacks, books, steps, anything.</p>
      <button class="button" type="button" @click="newJar">
        <AppIcon name="plus" :size="18" /> Create your first jar
      </button>
    </section>

    <section
      v-else-if="collections.active"
      :id="JAR_PANEL_ID"
      role="tabpanel"
      :aria-labelledby="jarTabId(collections.active.id)"
    >
      <!-- Item list arrives in Phase 4. -->
      <div v-if="items.loaded && !items.items.length" class="empty empty--jar">
        <p>This jar is empty — add something to count.</p>
      </div>
    </section>
  </main>

  <JarEditor v-model="jarEditorOpen" :jar="editingJar" />
  <ConfirmDialog />
  <AboutDialog v-model="aboutOpen" />
  <UpdateToast />
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  backdrop-filter: blur(12px);
}

.main {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-2) var(--space-4) calc(96px + env(safe-area-inset-bottom));
}

.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin-top: 10vh;
  text-align: center;
}

.empty h2 {
  margin: var(--space-3) 0 0;
  font-size: 1.375rem;
}

.empty p {
  margin: 0 0 var(--space-3);
  max-width: 34ch;
  color: var(--color-text-muted);
}

.empty--jar {
  margin-top: 14vh;
}
</style>
