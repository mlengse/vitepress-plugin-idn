# Contract: Public API (author-facing utilities)

**Spec**: FR-011–FR-015, FR-018 (stemming & syllabification utilities), SC-006, SC-007

All functions are pure, synchronous, deterministic, and safe for arbitrary input (never throw — FR-013). Usable from Node (build scripts) and browser (theme components) via the package's public entry (FR-014 — no internal/ deep imports required).

```ts
import { stem, syllabify, hyphenateText, tokenize, IDN_VERSION } from 'vitepress-plugin-idn'
```

## `stem(word: string, language?: 'id' | 'en'): string`

- Default `language` is `'id'`.
- **Contract examples (must hold in tests)**:

  | Input | Output |
  |---|---|
  | `'berlari'` | `'lari'` |
  | `'memadamkan'` | `'padam'` |
  | `'pemerintahan'` | `'perintah'` |
  | `'menyukai'` | `'suka'` |
  | `''` | `''` |
  | `'xyzzy'` (unknown) | `'xyzzy'` (input returned, FR-013) |

- Same function is used internally at index time and query time (FR-012) — authors get exactly what search sees.

## `syllabify(word: string, language?: 'id' | 'en'): string`

- Returns hyphen-separated syllables per Indonesian rules (FR-015): `'pemerintahan'` → `'pe-mer-in-ta-han'`.
- Words shorter than 3 characters or without vowels returned unchanged.
- For `language: 'en'`, falls back to hyphenation-pattern points (documented deviation).

## `hyphenateText(text: string, opts?: { language?: 'id' | 'en'; minWordLength?: number }): string`

- Returns `text` with soft hyphens (`U+00AD`) inserted at valid break points (FR-016) — visually identical until a line break occurs.
- Only touches word characters; whitespace/punctuation/URLs/code-like tokens (`no-break` substrings without spaces such as URLs are left intact if they contain `://`) are preserved byte-for-byte (FR-017 by contract).

## `tokenize(text: string, language?: 'id' | 'en'): string[]`

- Exposed for advanced integrations; returns normalized terms (lowercase, stop words removed, reduplication reduced, stemmed) — the exact terms the index stores.

## `IDN_VERSION: string`

- Package version, surfaced in UI diagnostics (`data-idn-version` attribute).

## Error contract

Every function: no throws for any input type at runtime (extra/missing args, numbers, `null` coerced defensively). Violations are bugs — covered by fuzz-ish unit tests over mixed inputs (FR-013).

## Non-guarantees

- Linguistic precision of `stem` follows the selected engine's quality (SC-006: ≥85% on the curated 50-word list), not a formal grammar.
- Utilities do not perform I/O and are side-effect free.
