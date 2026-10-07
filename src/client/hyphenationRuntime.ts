/**
 * T030 - Client-side hyphenation runtime (FR-016, US4 AC1/AC3/AC4).
 *
 * Injected into the VitePress client bundle (see `src/node/index.ts`) when
 * `hyphenate.enabled` is true. On first paint and after every SPA navigation
 * it walks the configured text containers and inserts soft hyphens into long
 * words, without ever touching code, links, or already-processed content.
 *
 * Constraints:
 * - never runs during SSR (guards on `document`/`window`)
 * - idempotent: processed containers are tagged and skipped on re-runs
 * - observes DOM mutations so client-side navigation is covered
 */

import { hyphenateText } from '../index'
import type { IdnLanguage } from '../core/types'

export interface HyphenationRuntimeOptions {
  language: IdnLanguage
  minWordLength: number
  selector: string
}

/** Elements whose text must never be broken (code, links, anchors, opt-out). */
const SKIP_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'script',
  'style',
  'textarea',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  '.header-anchor',
  '.vp-nolex',
  '[data-no-hyphen]',
  '[data-idn-hyphenated]',
].join(',')

const PROCESSED_ATTR = 'data-idn-hyphenated'

function canProcess(node: Node): boolean {
  const parent = node.parentElement
  if (!parent) return false
  if (parent.closest(SKIP_SELECTOR)) return false
  return /\p{L}{2,}/u.test(node.nodeValue ?? '')
}

function hyphenateContainer(root: Element, options: HyphenationRuntimeOptions): boolean {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  let changed = false
  let node = walker.nextNode()
  while (node) {
    const next = walker.nextNode()
    if (canProcess(node)) {
      const before = node.nodeValue ?? ''
      const after = hyphenateText(before, {
        language: options.language,
        minWordLength: options.minWordLength,
      })
      if (after !== before) {
        node.nodeValue = after
        changed = true
      }
    }
    node = next
  }
  return changed
}

/**
 * Hyphenate every matching, not-yet-processed container; returns the number
 * of containers whose text changed.
 */
export function applyHyphenation(options: HyphenationRuntimeOptions): number {
  if (typeof document === 'undefined') return 0
  let processed = 0
  for (const root of Array.from(document.querySelectorAll(options.selector))) {
    if (root.closest(SKIP_SELECTOR)) continue
    if (root.getAttribute(PROCESSED_ATTR) === 'true') continue
    hyphenateContainer(root, options)
    root.setAttribute(PROCESSED_ATTR, 'true')
    processed++
  }
  return processed
}

/**
 * Install the runtime: run once the DOM is ready, then on mutation
 * (debounced) to cover VitePress's client-side route transitions.
 */
export function installHyphenation(options: HyphenationRuntimeOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  let scheduled = false
  const run = (): void => {
    scheduled = false
    try {
      applyHyphenation(options)
    } catch {
      // Never let a hyphenation failure break the page.
    }
  }
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    window.setTimeout(run, 120)
  }
  const start = (): void => {
    run()
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
}
