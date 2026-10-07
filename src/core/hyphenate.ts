/**
 * T029 - Hyphenation for line wrapping (FR-016, FR-017, data-model §7).
 *
 * Soft hyphens (`U+00AD`) are inserted at Liang break points produced by the
 * `hyphenasi` package's `id` / `en` patterns (research R6). `hyphenasi` is the
 * user's fork of `hyphen` (github.com/mlengse/hyphenasi), adopted per FR-023;
 * it ships improved Indonesian (KBBI) patterns over the upstream archive. The
 * inserted text is invisible until a line break occurs, so the rendered string
 * is unchanged visually.
 *
 * Guarantees (contracts/public-api.md):
 * - only word characters are touched; whitespace, punctuation and URLs
 *   (substrings containing `://`) are preserved byte-for-byte (FR-017)
 * - words shorter than `minWordLength` are left intact (US4 AC3)
 * - re-running is idempotent (no doubled soft hyphens)
 * - never throws for any input (FR-013)
 */

import idHyphen from 'hyphenasi/id'
import enHyphen from 'hyphenasi/en'
import type { IdnLanguage } from './types'

/** The soft hyphen inserted at break points. */
export const SOFT_HYPHEN = '\u00AD'

const hyphenateIdSync = idHyphen.hyphenateSync
const hyphenateEnSync = enHyphen.hyphenateSync

export interface HyphenateTextOptions {
  language?: IdnLanguage
  /** Words shorter than this are untouched. Default: 6 (plugin default). */
  minWordLength?: number
}

/** A word-like core: letters, optionally with internal hyphens (reduplication). */
const TOKEN_RE = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}-]*)([^\p{L}\p{N}]*)$/u

function hyphenateSegment(
  segment: string,
  language: IdnLanguage,
  minWordLength: number,
): string {
  const stripped = segment.split(SOFT_HYPHEN).join('')
  if (stripped.length < minWordLength) return segment
  const fn = language === 'en' ? hyphenateEnSync : hyphenateIdSync
  try {
    return fn(stripped, { hyphenChar: SOFT_HYPHEN, minWordLength: minWordLength })
  } catch {
    return segment
  }
}

function hyphenateToken(
  token: string,
  language: IdnLanguage,
  minWordLength: number,
): string {
  // URLs and code-like tokens are never broken (FR-017).
  if (token.includes('://')) return token

  const match = TOKEN_RE.exec(token)
  if (!match) return token
  const [, pre = '', core = '', post = ''] = match
  if (core.length === 0) return token
  // Digits mark code-like tokens (versions, IDs): leave them intact.
  if (/\p{N}/u.test(core)) return token

  const strippedCore = core.split(SOFT_HYPHEN).join('')
  if (strippedCore.replace(/-/g, '').length < minWordLength) return token

  const parts = core.split('-').map((segment) => hyphenateSegment(segment, language, minWordLength))
  return `${pre}${parts.join('-')}${post}`
}

/**
 * Insert soft hyphens into `text` at valid Indonesian (or English) break
 * points. Whitespace and punctuation are preserved byte-for-byte.
 */
export function hyphenateText(text: string, opts: HyphenateTextOptions = {}): string {
  try {
    if (typeof text !== 'string' || text.length === 0) return ''
    const language = opts.language ?? 'id'
    const minWordLength =
      typeof opts.minWordLength === 'number' && opts.minWordLength > 0 ? opts.minWordLength : 6
    return text
      .split(/(\s+)/)
      .map((token) =>
        token.length === 0 || /^\s+$/.test(token)
          ? token
          : hyphenateToken(token, language, minWordLength),
      )
      .join('')
  } catch {
    return typeof text === 'string' ? text : ''
  }
}
