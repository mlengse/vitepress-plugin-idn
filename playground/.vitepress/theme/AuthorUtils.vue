<!--
  T025 (US3, FR-014) - author-facing utilities exercised end-to-end.

  Imports ONLY from the package public entries, exactly as an end user would:

      import { stem, syllabify, tokenize, IDN_VERSION } from 'vitepress-plugin-idn'
      import { IdnSearch } from 'vitepress-plugin-idn/vue'

  VitePress SSRs the layout, so the computed values below are baked into the
  static HTML and can be asserted without a browser (see
  tests/integration/test_author_utility.test.ts).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { IDN_VERSION, stem, syllabify, tokenize } from 'vitepress-plugin-idn'
import { IdnSearch } from 'vitepress-plugin-idn/vue'

/** Glossary of derived form -> kata dasar, the canonical US3 example. */
const STEM_EXAMPLES = ['berlari', 'pemerintahan', 'menyapu'] as const

const stems = computed(() =>
  STEM_EXAMPLES.map((word) => `stem('${word}') = ${stem(word)}`),
)

const syllabified = computed(() => {
  const word = 'pemerintahan'
  return `syllabify('${word}') = ${syllabify(word)}`
})

/** The exact terms the search index stores (FR-012 parity between paths). */
const tokens = computed(
  () =>
    `tokenize('mempercepat pembangunan ekonomis') = ${tokenize('mempercepat pembangunan ekonomis').join(', ')}`,
)
</script>

<template>
  <div class="idn-author-utils" :data-idn-version="IDN_VERSION">
    <p class="idn-author-utils__version">IDN_VERSION: {{ IDN_VERSION }}</p>
    <ul class="idn-author-utils__stems">
      <li v-for="line in stems" :key="line">{{ line }}</li>
    </ul>
    <p class="idn-author-utils__syllabify">{{ syllabified }}</p>
    <p class="idn-author-utils__tokens">{{ tokens }}</p>
    <!--
      Proves the `./vue` entry resolves inside a real theme bundle. Mounted via
      a <details> wrapper so the inactive modal never intercepts page clicks.
    -->
    <details class="idn-author-utils__search">
      <summary>Alat pencarian (external UI)</summary>
      <IdnSearch />
    </details>
  </div>
</template>

<style scoped>
.idn-author-utils {
  margin-top: 2rem;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider, #ddd);
  border-radius: 8px;
  font-size: 0.9rem;
}

.idn-author-utils__stems {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
}
</style>