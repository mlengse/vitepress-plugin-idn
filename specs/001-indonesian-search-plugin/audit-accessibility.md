# Accessibility audit — Search.vue (SC-008, SC-009, FR-022)

Companion to quickstart §7 and task T034. Recorded `2026-10-07` against
`src/client/Search.vue` @ `0.1.0`.

## Method

Static WCAG 2.1 AA review of the component's ARIA structure, keyboard model,
focus management, semantics, contrast sources, and touch-target sizing.

> Limitation: this environment has no live browser, so Lighthouse/axe were not
> executed against a running fixture. The audit is a code-level review; the
> one thing it cannot measure is rendered color contrast. Contrast here is
> sourced exclusively from VitePress design tokens (`--vp-c-text-*`,
> `--vp-c-brand-soft`, etc.), which ship with the default theme's AA-compliant
> palette, and custom values use `var(--vp-…)` fallbacks. A real axe run
> remains the final step for the reporter (see §4).

## Checks performed — all satisfied

| WCAG check | Implementation | Verdict |
| --- | --- | --- |
| Dialog role/structure | `role="dialog"`, `aria-modal="true"`, named via `aria-labelledby="idn-search-input"` (input's accessible name is the placeholder, an explicit `aria-label`) | Pass |
| Combobox semantics | `role="combobox"`, `aria-expanded` bound to listbox visibility, `aria-controls` present when the listbox exists, `aria-autocomplete="list"`, `aria-activedescendant` tracks `activeIndex`, option ids `idn-search-opt-N` | Pass |
| Listbox/options | `role="listbox"` with name; `role="option"` + `aria-selected` per row; options not tabbable (standard autocomplete pattern) | Pass |
| Keyboard: open | `Ctrl/Cmd+K` (global, not while typing) and `/` when not in an editable; trigger is a `<button>` | Pass |
| Keyboard: navigate | `ArrowDown`/`ArrowUp` cycle `activeIndex`, `Enter` opens the hit, both via real keydown handlers | Pass |
| Keyboard: close | `Esc` anywhere in the dialog closes; overlay `@click.self` also closes | Pass |
| Focus management | Open saves `document.activeElement` and focuses the input on `nextTick`; close restores prior focus; `Tab` traps within the dialog back/forward (`onDialogKeydown`) | Pass |
| Accessible names | Trigger, input, dialog, options and the `esc` close button each have a name | Pass |
| Live status | Messages use `role="status"` + `aria-live="polite"`; results container has dynamic `aria-busy` | Pass |
| Safe highlighting | Snippets are built in `src/core/search.ts` (escape `&`, `<`, `>` before wrapping matches in `<mark>`) then rendered via `v-html` — no raw content injection | Pass |
| Keyboard recoverability | Global handler ignores `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable` for `/` and `Esc`/`Ctrl+K` manage the dialog exclusive of typing contexts | Pass |

## Findings fixed in this task

1. **Touch target `idn-trigger`** — was `height: 32px` (< 40 px). Added
   `min-height: 40px` (SC-008, FR-022).
2. **Touch target `idn-esc`** — was `height: 24px`. Added
   `min-height: 40px`.
3. **iOS auto-zoom on focus** — `.idn-search-input` font-size `15px` → `16px`
   (prevents the < 16 px iOS focus zoom).
4. **`aria-expanded` static `"true"`** — now mirrors listbox visibility
   (`showList ? 'true' : 'false'`); `aria-controls` only points at
   `idn-search-listbox` when it is rendered.
5. **Trigger dialog semantics** — added `aria-haspopup="dialog"` to the
   trigger button.

## Residual items accepted

- `aria-keyshortcuts` is static `Control+K`; the visible kbd hint varies by
  platform (`⌘K` on Mac). Cosmetic — the accessible announcement is still
  consistent with an actual shortcut.
- The dialog box is labelled via the input element rather than a dedicated
  heading; compliant and shorter to localize (translations come from plugin
  options).

## Evidence

- Search UI keyboard/naming semantics are covered by
  `contracts/search-behavior.md` and exercised in `test_search_build.test.ts`
  (search button in HTML) plus unit tests for the query pipeline.
- Re-run for the record: `npx vitest run tests/integration` and
  `npm run verify:external` (component compiles green with the fixes).