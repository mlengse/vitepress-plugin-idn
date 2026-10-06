<script setup lang="ts">
/**
 * T016 - Default-theme search trigger + modal dialog (contracts/search-behavior.md).
 *
 * The plugin aliases this component over the default theme's
 * `./VPNavBarSearch.vue`, so it renders the nav trigger itself (R1).
 * The index chunk is fetched lazily on first open via `./indexLoader` (US2);
 * failures surface as a visible error state, never silent empty results
 * (FR-020, SC-010).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import options from 'virtual:vitepress-plugin-idn/options'
import { search } from '../core/search'
import type { QueryHit, QueryReason } from '../core/types'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const t = options.translations
const language = options.language

const isOpen = ref(false)
const query = ref('')
const state = ref<LoadState>('idle')
const hits = ref<QueryHit[]>([])
const reason = ref<QueryReason | null>(null)
const activeIndex = ref(-1)
const isMac = ref(false)

const inputEl = ref<HTMLInputElement | null>(null)
const dialogEl = ref<HTMLElement | null>(null)

interface LoadedIndex {
  index: import('../core/search').SearchIndex
  language: typeof language
  sections: Record<string, { title: string; titles: string[]; path: string }>
}

let loaded: LoadedIndex | null = null
let previousFocus: HTMLElement | null = null

const activeOptionId = computed(() =>
  activeIndex.value >= 0 && activeIndex.value < hits.value.length
    ? optionId(activeIndex.value)
    : '',
)

const showList = computed(() => state.value === 'ready' && hits.value.length > 0)

const message = computed(() => {
  if (state.value === 'loading') return t.loading
  if (state.value === 'error') return t.loadError
  if (state.value === 'idle') return null
  if (query.value.trim().length === 0) return t.typeMore
  if (reason.value === 'empty') return t.typeMore
  if (reason.value === 'stopwords-only') return t.stopwordHint
  if (hits.value.length === 0) return t.noResults
  return null
})

function optionId(index: number): string {
  return `idn-search-opt-${index}`
}

function ensureLoad(): void {
  if (state.value !== 'idle') return
  state.value = 'loading'
  import('./indexLoader')
    .then((module) => {
      const data = module.getSearchIndex()
      if (data.language !== language) {
        throw new Error(
          `[vitepress-plugin-idn] Search index language "${data.language}" does not ` +
            `match the configured language "${language}". Rebuild the site.`,
        )
      }
      loaded = data
      state.value = 'ready'
      runQuery()
    })
    .catch((error: unknown) => {
      console.error('[vitepress-plugin-idn] Failed to load the search index.', error)
      state.value = 'error'
    })
}

function runQuery(): void {
  if (!loaded) return
  const result = search(loaded.index, query.value, loaded.language)
  hits.value = result.hits
  reason.value = result.reason
  activeIndex.value = result.hits.length > 0 ? 0 : -1
}

watch(query, () => {
  if (state.value === 'ready') runQuery()
})

function sectionPath(id: string): string {
  return loaded?.sections[id]?.path ?? id.split('#')[0] ?? '/'
}

function anchorOf(id: string): string {
  const hash = id.indexOf('#')
  return hash === -1 ? '' : id.slice(hash + 1)
}

function hrefOf(hit: QueryHit): string {
  const base = withBase(sectionPath(hit.id))
  const anchor = anchorOf(hit.id)
  return anchor ? `${base}#${anchor}` : base
}

function go(hit: QueryHit): void {
  window.location.href = hrefOf(hit)
  close()
}

function move(delta: number): void {
  const count = hits.value.length
  if (count === 0) return
  const current = activeIndex.value
  const next = current < 0 ? (delta > 0 ? 0 : count - 1) : (current + delta + count) % count
  activeIndex.value = next
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const hit = hits.value[activeIndex.value]
    if (hit) go(hit)
  }
}

function focusables(): HTMLElement[] {
  const root = dialogEl.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]:not([tabindex="-1"])')]
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  const inside = active instanceof Node && dialogEl.value?.contains(active)
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault()
      last.focus()
    }
  } else if (!inside || active === last) {
    event.preventDefault()
    first.focus()
  }
}

function open(): void {
  if (isOpen.value) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  isOpen.value = true
  ensureLoad()
  void nextTick(() => inputEl.value?.focus())
}

function close(): void {
  if (!isOpen.value) return
  isOpen.value = false
  activeIndex.value = hits.value.length > 0 ? 0 : -1
  previousFocus?.focus?.()
}

function isEditable(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.tagName === 'SELECT' ||
    active.isContentEditable
  )
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const mod = event.metaKey || event.ctrlKey
  if (mod && !event.altKey && (event.key === 'k' || event.key === 'K')) {
    event.preventDefault()
    if (isOpen.value) close()
    else open()
    return
  }
  if (
    event.key === '/' &&
    !mod &&
    !event.altKey &&
    !isEditable() &&
    !isOpen.value
  ) {
    event.preventDefault()
    open()
  }
}

onMounted(() => {
  isMac.value = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <button
    class="VPNavBarSearch idn-search idn-trigger"
    type="button"
    :aria-label="t.placeholder"
    aria-keyshortcuts="Control+K"
    @click="open"
  >
    <svg class="idn-trigger-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <span class="idn-trigger-text">{{ t.placeholder }}</span>
    <span class="idn-trigger-kbd" aria-hidden="true">
      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
      <kbd>K</kbd>
    </span>
  </button>

  <Teleport to="body">
    <div v-if="isOpen" class="idn-overlay" @click.self="close">
      <section
        ref="dialogEl"
        class="idn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idn-search-input"
        @keydown="onDialogKeydown"
      >
        <div class="idn-search-box">
          <svg class="idn-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            id="idn-search-input"
            ref="inputEl"
            v-model="query"
            class="idn-search-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="idn-search-listbox"
            aria-autocomplete="list"
            :aria-activedescendant="activeOptionId"
            :aria-label="t.placeholder"
            :placeholder="t.placeholder"
            :lang="language"
            autocomplete="off"
            spellcheck="false"
            @keydown="onInputKeydown"
          />
          <button class="idn-esc" type="button" :aria-label="'Esc'" @click="close">
            esc
          </button>
        </div>

        <div class="idn-results" :aria-busy="state === 'loading' ? 'true' : 'false'">
          <p v-if="message" class="idn-message" role="status" aria-live="polite">
            {{ message }}
          </p>
          <ul
            v-else-if="showList"
            id="idn-search-listbox"
            role="listbox"
            :aria-label="t.placeholder"
          >
            <li
              v-for="(hit, index) in hits"
              :id="optionId(index)"
              :key="hit.id"
              class="idn-item"
              :class="{ 'is-active': index === activeIndex }"
              role="option"
              :aria-selected="index === activeIndex"
              @mousemove="activeIndex = index"
              @click="go(hit)"
            >
              <span class="idn-item-title">{{ hit.title }}</span>
              <span class="idn-item-path">
                {{ sectionPath(hit.id) }}<template v-if="hit.titles.length">
                  › {{ hit.titles.join(' › ') }}</template
                >
              </span>
              <span class="idn-item-snippet" v-html="hit.snippet"></span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.idn-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  min-width: 40px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  border-radius: 8px;
  background: var(--vp-c-bg-soft, #f6f6f7);
  color: var(--vp-c-text-2, #3c3c43);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.25s,
    color 0.25s,
    background-color 0.25s;
}

.idn-trigger:hover {
  border-color: var(--vp-c-brand-1, #3451b2);
  color: var(--vp-c-text-1, #213547);
}

.idn-trigger-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.idn-trigger-text {
  white-space: nowrap;
}

.idn-trigger-kbd {
  display: flex;
  gap: 2px;
}

.idn-trigger-kbd kbd {
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  color: var(--vp-c-text-3, #6c6c76);
  font-family: var(--vp-font-family-base, system-ui);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}

.idn-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: calc(var(--vp-nav-height, 64px) + 8vh);
  background: rgba(0, 0, 0, 0.4);
}

.idn-dialog {
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 32px));
  max-height: min(480px, calc(100vh - var(--vp-nav-height, 64px) - 16vh));
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  border-radius: 12px;
  background: var(--vp-c-bg, #fff);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.idn-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--vp-c-divider, #e2e2e3);
}

.idn-search-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--vp-c-text-3, #6c6c76);
}

.idn-search-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--vp-c-text-1, #213547);
  font-size: 15px;
}

.idn-search-input::placeholder {
  color: var(--vp-c-text-3, #6c6c76);
}

.idn-esc {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  border-radius: 4px;
  background: var(--vp-c-bg-soft, #f6f6f7);
  color: var(--vp-c-text-3, #6c6c76);
  font-size: 11px;
  text-transform: uppercase;
  cursor: pointer;
}

.idn-results {
  flex: 1;
  min-height: 48px;
  overflow-y: auto;
}

.idn-message {
  margin: 0;
  padding: 20px 16px;
  color: var(--vp-c-text-2, #3c3c43);
  font-size: 14px;
  text-align: center;
}

.idn-results[aria-busy='true'] .idn-message {
  color: var(--vp-c-text-3, #6c6c76);
}

.idn-results ul {
  margin: 0;
  padding: 6px;
  list-style: none;
}

.idn-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
}

.idn-item.is-active {
  background: var(--vp-c-default-soft, #f1f1f4);
}

.idn-item-title {
  color: var(--vp-c-text-1, #213547);
  font-size: 14px;
  font-weight: 600;
}

.idn-item-path {
  color: var(--vp-c-text-3, #6c6c76);
  font-size: 12px;
}

.idn-item-snippet {
  color: var(--vp-c-text-2, #3c3c43);
  font-size: 13px;
  line-height: 1.5;
}

.idn-item-snippet :deep(mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--vp-c-brand-soft, #dce4ff);
  color: inherit;
}

@media (max-width: 480px) {
  .idn-overlay {
    padding-top: var(--vp-nav-height, 64px);
  }

  .idn-dialog {
    width: 100vw;
    max-height: calc(100vh - var(--vp-nav-height, 64px));
    border: none;
    border-top: 1px solid var(--vp-c-divider, #e2e2e3);
    border-radius: 0;
  }

  .idn-trigger-text,
  .idn-trigger-kbd {
    display: none;
  }

  .idn-trigger {
    padding: 0;
    justify-content: center;
    border: none;
    background: transparent;
  }
}
</style>
