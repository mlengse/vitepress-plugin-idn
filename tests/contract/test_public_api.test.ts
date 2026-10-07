/**
 * T022 - Public API contract tests (US3, contracts/public-api.md).
 *
 * Verifies the package's public entry exports exactly the documented
 * utilities, the contract examples hold, and the error contract (no throws
 * for arbitrary input, FR-013) is satisfied.
 */

import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import {
  hyphenateText,
  IDN_VERSION,
  stem,
  syllabify,
  tokenize,
} from '../../src/index'

describe('public entry exports (FR-014)', () => {
  it('exposes the documented utility surface', () => {
    expect(typeof stem).toBe('function')
    expect(typeof syllabify).toBe('function')
    expect(typeof hyphenateText).toBe('function')
    expect(typeof tokenize).toBe('function')
    expect(typeof IDN_VERSION).toBe('string')
  })

  it('IDN_VERSION matches the package version', () => {
    expect(IDN_VERSION).toBe(pkg.version)
  })
})

describe('stem - contract examples', () => {
  const cases: Array<[string, string]> = [
    ['berlari', 'lari'],
    ['memadamkan', 'padam'],
    ['pemerintahan', 'perintah'],
    ['menyukai', 'suka'],
    ['', ''],
    ['xyzzy', 'xyzzy'],
  ]
  for (const [input, expected] of cases) {
    it(`stem('${input}') = '${expected}'`, () => {
      expect(stem(input)).toBe(expected)
    })
  }
})

describe('syllabify - contract examples', () => {
  it("syllabify('pemerintahan') = 'pe-mer-in-ta-han'", () => {
    expect(syllabify('pemerintahan')).toBe('pe-mer-in-ta-han')
  })

  it('short / vowel-less words are returned unchanged', () => {
    expect(syllabify('ka')).toBe('ka')
    expect(syllabify('srt')).toBe('srt')
  })
})

describe('tokenize - pipeline parity (FR-012)', () => {
  it('returns the exact terms the search index stores', () => {
    expect(tokenize('percepatan pembangunan ekonomis')).toEqual(['cepat', 'bangun', 'ekonomis'])
  })

  it('removes stop words', () => {
    expect(tokenize('dan yang untuk menulis buku')).toEqual(['tulis', 'buku'])
  })

  it('reduces reduplication and stems each token', () => {
    expect(tokenize('buku-buku berlari')).toEqual(['buku', 'lari'])
  })

  it('handles empty queries', () => {
    expect(tokenize('')).toEqual([])
  })
})

describe('error contract - never throws (FR-013)', () => {
  const inputs: unknown[] = [
    null,
    undefined,
    42,
    0,
    true,
    false,
    {},
    [],
    ['kata'],
    Symbol('x'),
    () => 'kata',
  ]

  it('stem never throws on arbitrary input', () => {
    for (const input of inputs) {
      expect(() => stem(input as never)).not.toThrow()
    }
  })

  it('syllabify never throws on arbitrary input', () => {
    for (const input of inputs) {
      expect(() => syllabify(input as never)).not.toThrow()
    }
  })

  it('hyphenateText never throws on arbitrary input', () => {
    for (const input of inputs) {
      expect(() => hyphenateText(input as never)).not.toThrow()
    }
  })

  it('tokenize never throws on arbitrary input', () => {
    for (const input of inputs) {
      expect(() => tokenize(input as never)).not.toThrow()
    }
  })
})