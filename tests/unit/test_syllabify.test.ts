/**
 * T026 - Syllabification unit tests (US4, FR-015, FR-018, SC-007).
 *
 * Asserts the curated 50+ word golden list (tests/fixtures/syllabify-golden.json)
 * plus the edge behavior from the public-api contract:
 * - `syllabify('pemerintahan')` -> `'pe-mer-in-ta-han'`
 * - words shorter than 3 characters or without a vowel are returned unchanged
 * - `language: 'en'` delegates to hyphenation break points
 * - never throws on arbitrary input (FR-013)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syllabify, splitSyllablesOf } from '../../src/core/syllabify'

const GOLDEN = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/syllabify-golden.json'), 'utf8'),
) as Array<[string, string]>

describe('syllabify - golden list (SC-007)', () => {
  it('has at least 50 words', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(50)
  })

  it('reproduces the curated syllable split for every word', () => {
    for (const [word, expected] of GOLDEN) {
      expect(syllabify(word), `syllabify('${word}')`).toBe(expected)
    }
  })

  it('syllables rejoin (minus hyphens) into the original word', () => {
    for (const [word] of GOLDEN) {
      expect(splitSyllablesOf(word).join('')).toBe(word)
    }
  })
})

describe('syllabify - contract edges', () => {
  it('returns the contract example pe-mer-in-ta-han', () => {
    expect(syllabify('pemerintahan')).toBe('pe-mer-in-ta-han')
  })

  it('returns words shorter than 3 characters unchanged', () => {
    expect(syllabify('ka')).toBe('ka')
    expect(syllabify('')).toBe('')
    expect(syllabify('a')).toBe('a')
  })

  it('returns words without a vowel unchanged', () => {
    expect(syllabify('srt')).toBe('srt')
    expect(syllabify('xyzzy')).toBe('xyzzy')
  })

  it('handles mixed case deterministically', () => {
    expect(syllabify('PEMERINTAHAN')).toBe('pe-mer-in-ta-han')
    expect(syllabify('Berlari')).toBe('ber-la-ri')
  })

  it('falls back to hyphenation points for English', () => {
    const en = syllabify('development', 'en')
    expect(en).toContain('-')
    expect(en.replace(/-/g, '')).toBe('development')
    // English words without a vowel are untouched.
    expect(syllabify('rhythm', 'en')).toBe('rhythm')
  })

  it('never throws for arbitrary input (FR-013)', () => {
    expect(() => syllabify('1234567890')).not.toThrow()
    expect(() => syllabify('kata-kata')).not.toThrow()
    expect(() => syllabify('  ')).not.toThrow()
    expect(() => syllabify('a-b')).not.toThrow()
  })
})