<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AboutDialog from './components/AboutDialog.vue'
import UpdateToast from './components/UpdateToast.vue'
import { useSettingsStore } from './stores/settings'
import { LOGO_URL } from './lib/assets'

// Instantiate early so the theme watcher is active from the first render.
useSettingsStore()

const aboutOpen = ref(false)
</script>

<template>
  <AppHeader @about="aboutOpen = true" />

  <main class="main">
    <!-- Placeholder until jars arrive in Phase 3. -->
    <section class="empty">
      <img :src="LOGO_URL" alt="" width="120" height="120" />
      <h2>Your jars will live here</h2>
      <p>Tallyjar is getting set up. Jars and counting are coming soon.</p>
    </section>
  </main>

  <AboutDialog v-model="aboutOpen" />
  <UpdateToast />
</template>

<style scoped>
.main {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-4) calc(96px + env(safe-area-inset-bottom));
}

.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin-top: 12vh;
  text-align: center;
}

.empty h2 {
  margin: var(--space-3) 0 0;
  font-size: 1.375rem;
}

.empty p {
  margin: 0;
  max-width: 32ch;
  color: var(--color-text-muted);
}
</style>
