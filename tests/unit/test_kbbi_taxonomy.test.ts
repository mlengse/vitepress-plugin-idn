/**
 * Defect taxonomy rules (T008, FR-003, FR-006, FR-007, R9).
 *
 * The taxonomy exists so that "is this a plugin bug or a reference artefact?"
 * stops being a matter of opinion. These tests therefore assert two things at
 * once: that each rule fires when it should, and - more importantly - that the
 * four forbidden anti-patterns in `contracts/defect-taxonomy.md` cannot appear.
 * An anti-pattern firing means the toolkit itself is wrong, which is a far more
 * expensive failure than a wrong classification of one word.
 */

import { describe, expect, it } from 'vitest'
import type { DefectClass } from '../../tools/kbbi/types'
import {
  AFFIX_PREFIXES,
  AFFIX_SUFFIXES,
  PLURAL_SUFFIXES,
  classifyDefect,
  countsFailure,
  defaultTriageNote,
  type DefectContext,
} from '../../tools/kbbi/compare'

function context(overrides: Partial<DefectContext> & Pick<DefectContext, 'capability'>): DefectContext {
  return {
    word: 'memdongeng',
    pluginOutput: 'dongeng',
    referenceOutput: 'dongeng',
    referencePresent: true,
    isRootWord: false,
    hasDerivedMapping: true,
    stratum: 'core',
    referenceSyllables: [],
    ...overrides,
  }
}

describe('taxonomy - ordered rules (R9)', () => {
  it('reports reference-missing only when the reference map has no entry', () => {
    expect(
      classifyDefect(context({ capability: 'stem', referencePresent: false, pluginOutput: 'dongeng' })),
    ).toBe('reference-missing')
  })

  it('does NOT report reference-missing for a word the hyphenation dictionary has', () => {
    // Forbidden anti-pattern 1: a word that is plainly in the dictionary must
    // never be reported as "no data available".
    const result = classifyDefect(
      context({
        capability: 'syllable',
        word: 'pintar',
        referencePresent: true,
        pluginOutput: 'pint-ar',
        referenceOutput: 'pin-tar',
        referenceSyllables: ['pin', 'tar'],
      }),
    )
    expect(result).not.toBe('reference-missing')
    expect(result).toBe('syllable-boundary-shift')
  })

  it('reports root-word-self only for a root word with no derived mapping', () => {
    expect(
      classifyDefect(
        context({
          capability: 'stem',
          word: 'buku',
          isRootWord: true,
          hasDerivedMapping: false,
          pluginOutput: 'buku',
          referenceOutput: 'buku',
        }),
      ),
    ).toBe('root-word-self')
  })

  it('does NOT report root-word-self for a word that has a derived mapping', () => {
    // Forbidden anti-pattern 2.
    const result = classifyDefect(
      context({
        capability: 'stem',
        word: 'bantuan',
        isRootWord: true,
        hasDerivedMapping: true,
        pluginOutput: 'bantuan',
        referenceOutput: 'bantu',
      }),
    )
    expect(result).not.toBe('root-word-self')
  })

  it('never applies root-word-self to the hyphenation capability', () => {
    // A base word is still perfectly comparable for syllabification; excluding
    // it would drop thousands of valid entries from the denominator.
    expect(
      classifyDefect(
        context({
          capability: 'syllable',
          word: 'buku',
          isRootWord: true,
          hasDerivedMapping: false,
          pluginOutput: 'bu-ku',
          referenceOutput: 'bu-ku',
          referenceSyllables: ['bu', 'ku'],
        }),
      ),
    ).not.toBe('root-word-self')
  })

  it('detects plural-root from the contract example', () => {
    expect(
      classifyDefect(
        context({
          capability: 'stem',
          word: 'bukunya',
          pluginOutput: 'buk',
          referenceOutput: 'buku',
        }),
      ),
    ).toBe('plural-root')
  })

  it('detects affix-strip-missed when a prefix survives', () => {
    expect(
      classifyDefect(
        context({
          capability: 'stem',
          word: 'menuliskan',
          pluginOutput: 'menulis',
          referenceOutput: 'tulis',
        }),
      ),
    ).toBe('affix-strip-missed')
  })

  it('detects affix-strip-missed when a suffix survives', () => {
    expect(
      classifyDefect(
        context({
          capability: 'stem',
          word: 'abangan',
          pluginOutput: 'abangan',
          referenceOutput: 'abang',
        }),
      ),
    ).toBe('affix-strip-missed')
  })

  it('detects over-stripped when the plugin cuts into the reference root', () => {
    expect(
      classifyDefect(
        context({ capability: 'stem', word: 'adukan', pluginOutput: 'adu', referenceOutput: 'aduk' }),
      ),
    ).toBe('over-stripped')
  })

  it('separates a boundary shift from a count difference before the generic classes', () => {
    expect(
      classifyDefect(
        context({
          capability: 'syllable',
          pluginOutput: 'ma-dras',
          referenceOutput: 'mad-ras',
          referenceSyllables: ['mad', 'ras'],
        }),
      ),
    ).toBe('syllable-boundary-shift')

    expect(
      classifyDefect(
        context({
          capability: 'syllable',
          pluginOutput: 'mem-ba-ru',
          referenceOutput: 'mem-ba-ru-kan',
          referenceSyllables: ['mem', 'ba', 'ru', 'kan'],
        }),
      ),
    ).toBe('syllable-count-diff')
  })

  it('does NOT report syllable-count-diff when the counts are equal', () => {
    // Forbidden anti-pattern 3: both sides have four syllables, so this is a
    // boundary shift no matter how different the boundaries look.
    const result = classifyDefect(
      context({
        capability: 'syllable',
        pluginOutput: 'me-mem-ba-ru',
        referenceOutput: 'mem-ba-ru-kan',
        referenceSyllables: ['mem', 'ba', 'ru', 'kan'],
      }),
    )
    expect(result).not.toBe('syllable-count-diff')
    expect(result).toBe('syllable-boundary-shift')
  })

  it('falls through to data-divergence outside the core corpus', () => {
    // A loan word is out of scope entirely, so it never becomes a
    // syllable-class finding however the counts differ (R5, T023).
    expect(
      classifyDefect(
        context({
          capability: 'syllable',
          word: 'antui',
          pluginOutput: 'an-tu-i',
          referenceOutput: 'an-tui',
          stratum: 'loan',
          referenceSyllables: ['an', 'tui'],
        }),
      ),
    ).toBe('data-divergence')
  })

  it('falls through to candidate-bug inside the core corpus', () => {
    expect(
      classifyDefect(
        context({ capability: 'stem', word: 'masaung', pluginOutput: 'masaung', referenceOutput: 'saung' }),
      ),
    ).toBe('candidate-bug')
  })

  it('does NOT report data-divergence for a core-corpus word', () => {
    // Forbidden anti-pattern 4: the word is inside the core corpus, so an
    // unexplained difference is a candidate bug, not a reference artefact.
    const result = classifyDefect(
      context({ capability: 'stem', word: 'masaung', pluginOutput: 'masaung', referenceOutput: 'saung' }),
    )
    expect(result).not.toBe('data-divergence')
  })

  it('reports a partial affix loss that no pattern explains as a candidate bug', () => {
    expect(
      classifyDefect(
        context({
          capability: 'stem',
          word: 'memacak',
          pluginOutput: 'acak',
          referenceOutput: 'pacak',
        }),
      ),
    ).toBe('candidate-bug')
  })
})

describe('taxonomy - failure accounting (FR-003)', () => {
  it('never counts reference-missing or root-word-self as a failure', () => {
    expect(countsFailure('reference-missing')).toBe(false)
    expect(countsFailure('root-word-self')).toBe(false)
  })

  it('does not count data-divergence as a failure (it is triaged, not fixed)', () => {
    expect(countsFailure('data-divergence')).toBe(false)
  })

  it('counts every rule-explainable class as a failure', () => {
    for (const defectClass of [
      'plural-root',
      'affix-strip-missed',
      'over-stripped',
      'syllable-boundary-shift',
      'syllable-count-diff',
      'candidate-bug',
    ] as const) {
      expect(countsFailure(defectClass), defectClass).toBe(true)
    }
  })
})

describe('taxonomy - mandatory triage notes (FR-006)', () => {
  it('supplies a note for each class that requires one', () => {
    for (const defectClass of ['data-divergence', 'reference-missing', 'root-word-self'] as const) {
      expect(defaultTriageNote(defectClass).length).toBeGreaterThan(0)
    }
  })

  it('supplies a mechanism note for every other class too', () => {
    // The contract only *requires* notes for three classes, but a bare
    // `candidate-bug` row tells a reviewer nothing about what to do next. Every
    // class states its mechanism, and each note says why the word landed there
    // rather than merely repeating the class name.
    const all: DefectClass[] = [
      'reference-missing',
      'root-word-self',
      'plural-root',
      'affix-strip-missed',
      'over-stripped',
      'syllable-boundary-shift',
      'syllable-count-diff',
      'data-divergence',
      'candidate-bug',
    ]
    for (const defectClass of all) {
      const note = defaultTriageNote(defectClass)
      expect(note.length, defectClass).toBeGreaterThan(0)
      expect(note.includes(defectClass), `${defectClass}: note hanya mengulang nama kelas`).toBe(false)
    }
  })

  it('distinguishes the two hyphenation classes in their notes', () => {
    expect(defaultTriageNote('syllable-boundary-shift')).toContain('batas')
    expect(defaultTriageNote('syllable-count-diff')).toContain('Jumlah suku kata')
  })
})

describe('taxonomy - affix vocabulary is narrow on purpose', () => {
  it('keeps plural suffixes to genuine plural or possessive markers', () => {
    // A broad `-an` rule would swallow ordinary derivation and mislabel it.
    expect(PLURAL_SUFFIXES).not.toContain('an')
    expect(PLURAL_SUFFIXES).toContain('nya')
  })

  it('has no duplicate prefixes, so the rule cannot fire twice on one affix', () => {
    expect(new Set(AFFIX_PREFIXES).size).toBe(AFFIX_PREFIXES.length)
    expect(new Set(AFFIX_SUFFIXES).size).toBe(AFFIX_SUFFIXES.length)
  })
})