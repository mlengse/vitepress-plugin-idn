/**
 * T027 - Hyphenation unit tests (US4, FR-016, FR-017).
 *
 * The public contract (contracts/public-api.md, US4 AC3):
 * - soft hyphens (`U+00AD`) are inserted at valid break points
 * - only word characters are touched; whitespace/punctuation/URLs and
 *   code-like tokens are preserved byte-for-byte
 * - words shorter than `minWordLength` are untouched
 * - idempotent and never throws (FR-013)
 */

import { describe, expect, it } from 'vitest'
import { hyphenateText, SOFT_HYPHEN } from '../../src/core/hyphenate'

function bare(text: string): string {
  return text.split(SOFT_HYPHEN).join('')
}

describe('hyphenateText - break points (FR-016)', () => {
  it('inserts soft hyphens into long Indonesian words', () => {
    const out = hyphenateText('pemerintahan')
    expect(out).not.toBe('pemerintahan')
    expect(out).toContain(SOFT_HYPHEN)
    expect(bare(out)).toBe('pemerintahan')
  })

  it('uses hyphen/id break points for Indonesian', () => {
    const out = hyphenateText('pemerintahan')
    // The Liang /id patterns: pe|me|rin|tah|an.
    expect(out).toBe(`pe${SOFT_HYPHEN}me${SOFT_HYPHEN}rin${SOFT_HYPHEN}tah${SOFT_HYPHEN}an`)
  })

  it('is idempotent', () => {
    const once = hyphenateText('pemerintahan berkelanjutan')
    expect(hyphenateText(once)).toBe(once)
  })

  it('respects minWordLength', () => {
    expect(hyphenateText('buku')).toBe('buku')
    expect(hyphenateText('buku', { minWordLength: 4 })).toContain(SOFT_HYPHEN)
  })

  it('supports English break points', () => {
    const out = hyphenateText('implementation', { language: 'en' })
    expect(out).toContain(SOFT_HYPHEN)
    expect(bare(out)).toBe('implementation')
  })
})

describe('hyphenateText - byte-for-byte preservation (FR-017)', () => {
  it('leaves URLs intact', () => {
    const url = 'https://contoh.example.com/artikel/berkelanjutan'
    expect(hyphenateText(url)).toBe(url)

    // Surrounding text may be hyphenated, but the URL substring is untouched.
    const sentence = `Baca di ${url} sekarang`
    const out = hyphenateText(sentence)
    expect(out).toContain(url)
  })

  it('preserves whitespace and punctuation', () => {
    const input = '  Pemerintahan; berkelanjutan - ya.  '
    const out = hyphenateText(input)
    expect(out).toMatch(/^ {2}P/)
    expect(out).toMatch(/; /)
    expect(out).toMatch(/ - ya\.\s{2}$/)
    // Rejoining the *visible* characters reproduces the input byte-for-byte.
    expect(bare(out)).toBe(bare(input))
  })

  it('leaves code-like tokens (digits, symbols) untouched', () => {
    expect(hyphenateText('v1.2.3')).toBe('v1.2.3')
    expect(hyphenateText('package@2.0.1')).toBe('package@2.0.1')
    expect(hyphenateText('const x = 3')).toBe('const x = 3')
  })

  it('handles beginning-of-sentence capitalization', () => {
    const out = hyphenateText('Pemerintahan')
    expect(out[0]).toBe('P')
    expect(bare(out)).toBe('Pemerintahan')
  })
})

describe('hyphenateText - robustness (FR-013)', () => {
  it('returns empty string for empty input', () => {
    expect(hyphenateText('')).toBe('')
  })

  it('returns the input when nothing qualifies', () => {
    expect(hyphenateText('a b c')).toBe('a b c')
  })

  it('never throws on arbitrary input', () => {
    expect(() => hyphenateText('')).not.toThrow()
    expect(() => hyphenateText('   ')).not.toThrow()
    expect(() => hyphenateText(''.repeat(1000))).not.toThrow()
  })
})