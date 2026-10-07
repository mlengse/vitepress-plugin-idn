/**
 * Canonical-form rules (T007, FR-006, R8).
 *
 * The canonical form is where the two most expensive false positives die: a
 * capital letter in the middle of a reference entry (`"atlantik": "At.lan.tik"`)
 * and a compound separator mistaken for a syllable separator. Every rule below
 * exists because skipping it produces thousands of findings that are not
 * findings.
 *
 * These tests are pure and need no snapshot: they pin the normalisation rules
 * themselves, not the data.
 */

import { describe, expect, it } from 'vitest'
import {
  canonicalPluginHyphenation,
  canonicalSyllableString,
  canonicalSyllables,
  canonicalWord,
  classifyStratum,
  isCompoundOrReduplication,
  parseTopLevelEntries,
} from '../../tools/kbbi/corpus'

describe('canonicalWord', () => {
  it('lowercases and trims outer whitespace (R8 rules 1 and 2)', () => {
    expect(canonicalWord('  MEMBANTU  ')).toBe('membantu')
  })

  it('keeps the hyphen of a compound word as a separator (R8 rule 4)', () => {
    expect(canonicalWord('Abu-Abo')).toBe('abu-abo')
  })

  it('keeps a reduplication whole (R8 rule 5)', () => {
    expect(canonicalWord('ayam-ayaman')).toBe('ayam-ayaman')
  })

  it('never returns a padded string', () => {
    for (const raw of ['  a  ', '', '   ', 'BUKU']) {
      expect(canonicalWord(raw)).toBe(canonicalWord(raw).trim())
    }
  })
})

describe('canonicalSyllables', () => {
  it('turns the dot notation into the canonical form', () => {
    expect(canonicalSyllableString('pin.tar')).toBe('pin-tar')
  })

  it('lowercases a capital that appears mid-entry', () => {
    expect(canonicalSyllableString('At.lan.tik')).toBe('at-lan-tik')
    expect(canonicalSyllables('At.lan.tik')).toEqual(['at', 'lan', 'tik'])
  })

  it('treats an existing hyphen exactly like a dot', () => {
    expect(canonicalSyllableString('a.has')).toBe('a-has')
    expect(canonicalSyllableString('a-has')).toBe('a-has')
  })

  it('produces at least one element for any non-blank input', () => {
    expect(canonicalSyllables('a')).toEqual(['a'])
    expect(canonicalSyllables('.')).toEqual([])
  })

  it('normalises what the plugin returned the same way', () => {
    expect(canonicalPluginHyphenation('MA-KSA')).toBe('ma-ksa')
    expect(canonicalPluginHyphenation('ma-ksa')).toBe('ma-ksa')
  })
})

describe('classifyStratum', () => {
  it('calls plain Indonesian phonotactics core', () => {
    expect(classifyStratum(['mam', 'ma'])).toBe('core')
    expect(classifyStratum(['ber', 'ke', 'bang'])).toBe('core')
  })

  it('calls a non-Indonesian onset loan', () => {
    expect(classifyStratum(['ab', 'i', 'o', 'lo', 'gi'])).toBe('core') // onset is 'a'
    expect(classifyStratum(['kn', 'is'])).toBe('loan')
    expect(classifyStratum(['sy', 'lah'])).toBe('loan')
    expect(classifyStratum(['str', 'uk'])).toBe('loan')
    expect(classifyStratum(['bl', 'ok'])).toBe('loan')
  })

  it('does not treat an ordinary Indonesian cluster as a loan', () => {
    // `st` is not in the loan list even though the machine accepts it as an
    // onset: the list is the non-Indonesian set, not the whole onset table.
    expect(classifyStratum(['st', 'ruk'])).toBe('core')
    expect(classifyStratum(['pe', 'ker'])).toBe('core')
  })

  it('prefers the longest matching cluster', () => {
    // 'str' must win over 'st'-like prefixes; the set is sorted longest-first.
    expect(classifyStratum(['str', 'uk'])).toBe('loan')
  })

  it('treats an empty syllable list as core rather than guessing', () => {
    expect(classifyStratum([])).toBe('core')
  })
})

describe('isCompoundOrReduplication', () => {
  it('flags compounds and reduplications, and nothing else', () => {
    expect(isCompoundOrReduplication('abu-abo')).toBe(true)
    expect(isCompoundOrReduplication('ayam-ayaman')).toBe(true)
    expect(isCompoundOrReduplication('berkembang')).toBe(false)
  })
})

describe('parseTopLevelEntries', () => {
  it('preserves file order', () => {
    const entries = parseTopLevelEntries('{"b":"1","a":"2"}')
    expect(entries.map(([key]) => key)).toEqual(['b', 'a'])
  })

  it('keeps duplicate keys instead of letting JSON.parse keep the last one', () => {
    // The pinned rule is "the top entry that carries a mapping, in file order".
    // `JSON.parse` would silently collapse this to the second entry.
    const text = '{"kata":{"kataDasar":"first"},"kata":{"kataDasar":"second"}}'
    const entries = parseTopLevelEntries(text)
    expect(entries).toHaveLength(2)
    expect((entries[0]![1] as { kataDasar: string }).kataDasar).toBe('first')
  })

  it('reads nested objects without being confused by inner braces', () => {
    const entries = parseTopLevelEntries(
      '{"membantu":{"kataDasar":"bantu","kelasKata":["v","n"]},"menari":{"kataDasar":"tari"}}',
    )
    expect(entries).toHaveLength(2)
    expect(entries[0]![1]).toEqual({ kataDasar: 'bantu', kelasKata: ['v', 'n'] })
  })

  it('ignores commas and whitespace inside nested values', () => {
    const entries = parseTopLevelEntries('{ "a" : { "x" : "p,q" } , "b" : 2 }')
    expect((entries[0]![1] as { x: string }).x).toBe('p,q')
    expect(entries[1]![1]).toBe(2)
  })

  it('handles nested arrays', () => {
    const entries = parseTopLevelEntries('{"membantu":{"kelasKata":["v","n"],"kataDasar":"bantu"}}')
    expect((entries[0]![1] as { kelasKata: string[] }).kelasKata).toEqual(['v', 'n'])
  })

  it('returns nothing for a non-object payload', () => {
    expect(parseTopLevelEntries('[]')).toEqual([])
    expect(parseTopLevelEntries('')).toEqual([])
  })
})