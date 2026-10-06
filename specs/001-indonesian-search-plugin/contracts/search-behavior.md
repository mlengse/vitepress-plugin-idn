# Contract: Search Index & Search UI Behavior

**Spec**: FR-001–FR-006, FR-009, FR-010, FR-012; SC-001–SC-004, SC-008–SC-010

## Index contract (virtual module)

- **Specifier**: `virtual:vitepress-plugin-idn/index` (Vite virtual module, R7).
- **Shape** (serialized MiniSearch index + envelope):

```ts
interface SearchIndexEnvelope {
  schemaVersion: 1
  language: 'id' | 'en'
  stopWordsSnapshot: string   // hash of stop-word list used at index time
  generatedAt: string         // ISO timestamp, diagnostics only
  index: string               // MiniSearch JSON (loadJSON payload)
  sections: Record<string, { title: string; titles: string[]; path: string }>
  //  ^ client-side display metadata keyed by record id (path#anchor)
}
```

- **Delivery**: dev → served by plugin `load()`; build → emitted as a lazily-imported JS chunk, fetched only on first search modal open (US2 Scenario 2).
- **Freshness (FR-006)**: dev HMR rescans a `.md` file on change and replaces the module; build rescans the full `include` set each build. Never serves a mixed old/new index (transitions in data-model §4).

## Matching contract (FR-001, FR-002, FR-009, FR-012)

Identical pipeline on both sides:

```text
normalize → tokenize → drop stop words → reduce reduplication → stem → MiniSearch match
```

- A hit's `id` resolves to a real section anchor on the built site (deep link must work — FR-001, R2).
- Boosts: `title` > `titles` > `text`.
- Snippets show the matched term highlighted (FR-001).

## Empty & degraded states (FR-010, SC-002, SC-010)

| Situation | Required UI behavior |
|---|---|
| No hits | Explicit "no results" message (never a blank panel) |
| Query is all stop words | Message explaining stop words were filtered — **no unfiltered fallback results** |
| Index failed to load/mismatched schema | Error state with console error; input remains usable |
| Query shorter than 1 meaningful term | Prompt to type more, no request dispatched |

## Search UI contract (`ui: 'nav'`, default theme)

| Behavior | Requirement |
|---|---|
| Trigger | Search button rendered in nav bar (same slot as default theme's); opens modal |
| Open hotkeys | `Ctrl/Cmd+K` and `/` (only when focus is not in an editable element) |
| Close | `Esc` or backdrop click; focus returns to trigger |
| Keyboard nav | `↑`/`↓` move active result, `Enter` opens — all results keyboard-reachable |
| Semantics | Modal has `role="dialog"` + `aria-modal="true"` + labelled by search input; list uses `role="listbox"`/`option`; active option `aria-selected` |
| Focus trap | Tab cycles within modal while open |
| Mobile (SC-008) | Full-width sheet under the nav bar; touch targets ≥ 40 px; works at 360 px viewport |
| Latency (SC-003) | Results rendered < 1 s after query submission on a 500-page site (index already loaded) |
| Loading | While index chunk loads, input stays enabled with a "loading" status (`aria-busy`) |

## Hyphenation runtime contract (FR-016, FR-017)

- Runs once post-mount (no hydration mismatch), scoped to `hyphenate.selector`.
- **Skip list is absolute**: never touches `pre`, `code`, `a`, `.header-anchor`, `[data-no-hyphen]` — even if the selector matches them.
- Idempotent: re-running inserts no additional `U+00AD`.
