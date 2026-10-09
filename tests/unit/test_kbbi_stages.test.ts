/**
 * Stage gates (T026, FR-008 s.d. FR-010, FR-019, SC-003, SC-004, SC-014).
 *
 * A stage is the mechanism that makes "bertahap" mean something, so the tests
 * here are about refusal as much as acceptance: an oversized stage, a stage
 * mixing two capabilities, and a promotion that skips verification must all
 * fail loudly rather than quietly produce a weaker guarantee.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadDefectStore: vi.fn(),
  writeDefectStore: vi.fn(),
}))

vi.mock('../../tools/kbbi/compare.ts', () => ({
  countsFailure: (cls: string) =>
    !['reference-missing', 'data-divergence', 'root-word-self'].includes(cls),
  defectKey: () => 'key',
  detectContractLock: async () => ({ contractLocked: false, source: '' }),
  loadDefectStore: mocks.loadDefectStore,
  writeDefectStore: mocks.writeDefectStore,
}))

import {
  BUILD_FULL_GATE,
  MAX_DEFECTS_PER_STAGE,
  StageError,
  assertPromotable,
  buildStage,
  evaluateGates,
  filterNonFailureDefects,
  nextStageId,
  reconcileNonReproducing,
  runRegressionCases,
  runSearchJoinGate,
  triageNonFailureFindings,
} from '../../tools/kbbi/stages'
import type { Defect, DefectClass, Stage } from '../../tools/kbbi/types'

const BASELINE = { stem: 0.8, syllable: 0.7 }

function finding(word: string, capability: 'stem' | 'syllable' = 'stem'): {
  word: string
  capability: 'stem' | 'syllable'
  class: DefectClass
} {
  return { word, capability, class: 'candidate-bug' }
}

function stageWith(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'stage-01',
    createdAt: '2026-10-07T20:45:00.000Z',
    capability: 'stem',
    defects: ['adukan'],
    baselineAccuracy: { ...BASELINE },
    finalAccuracy: { ...BASELINE },
    regressions: [],
    gatesRun: [],
    gateResults: {},
    status: 'in-progress',
    ...overrides,
  }
}

function passingGates(): string[] {
  return ['npm test', 'npm run lint', 'npm run typecheck', BUILD_FULL_GATE]
}

/** `gatesRun` alone is not enough: each entry must carry a `pass` result. */
function gateResults(result: 'pass' | 'fail' = 'pass'): Record<string, 'pass' | 'fail'> {
  return Object.fromEntries(passingGates().map((gate) => [gate, result]))
}

describe('buildStage - shape limits (SC-003)', () => {
  it('accepts a stage at exactly the cap', () => {
    const defects = Array.from({ length: MAX_DEFECTS_PER_STAGE }, (_, index) =>
      finding(`kata${index}`),
    )
    const stage = buildStage({
      id: 'stage-01',
      createdAt: '2026-10-07T20:45:00.000Z',
      capability: 'stem',
      defects,
      baselineAccuracy: BASELINE,
    })
    expect(stage.defects).toHaveLength(MAX_DEFECTS_PER_STAGE)
  })

  it('rejects a stage with more than 20 findings', () => {
    const defects = Array.from({ length: MAX_DEFECTS_PER_STAGE + 1 }, (_, index) =>
      finding(`kata${index}`),
    )
    expect(() =>
      buildStage({
        id: 'stage-02',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'stem',
        defects,
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(StageError)
    expect(() =>
      buildStage({
        id: 'stage-02',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'stem',
        defects,
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(/20/)
  })

  it('rejects a stage that mixes two capabilities', () => {
    expect(() =>
      buildStage({
        id: 'stage-03',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'stem',
        defects: [finding('adukan', 'stem'), finding('memari', 'syllable')],
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(/satu kapabilitas/)
  })

  it('rejects a stage holding a finding that is not counted as a failure', () => {
    expect(() =>
      buildStage({
        id: 'stage-04',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'syllable',
        defects: [{ word: 'antui', capability: 'syllable', class: 'data-divergence' }],
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(/triase/)
  })

  it('rejects an empty stage and a stage with a repeated word', () => {
    expect(() =>
      buildStage({
        id: 'stage-05',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'stem',
        defects: [],
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(StageError)

    expect(() =>
      buildStage({
        id: 'stage-06',
        createdAt: '2026-10-07T20:45:00.000Z',
        capability: 'stem',
        defects: [finding('adukan'), finding('adukan')],
        baselineAccuracy: BASELINE,
      }),
    ).toThrow(/berulang/)
  })

  it('starts in-progress, never passed', () => {
    const stage = buildStage({
      id: 'stage-01',
      createdAt: '2026-10-07T20:45:00.000Z',
      capability: 'stem',
      defects: [finding('adukan')],
      baselineAccuracy: BASELINE,
    })
    expect(stage.status).toBe('in-progress')
  })
})

describe('nextStageId', () => {
  it('increments without gaps', () => {
    expect(nextStageId([])).toBe('stage-01')
    expect(nextStageId(['stage-01'])).toBe('stage-02')
    expect(nextStageId(['stage-01', 'stage-02'])).toBe('stage-03')
    expect(nextStageId(['stage-09'])).toBe('stage-10')
  })

  it('ignores names that are not stage ids', () => {
    expect(nextStageId(['catatan'])).toBe('stage-01')
  })
})

describe('evaluateGates - G1 regressions', () => {
  it('fails G1 when a regression case started failing again', () => {
    const result = evaluateGates(
      stageWith({ regressions: ['bukunya: diharapkan buku, ditemukan buk'], gatesRun: passingGates() }),
    )
    expect(result.g1RegressionsEmpty).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('passes G1 on an empty regression list', () => {
    const result = evaluateGates(stageWith({ gatesRun: passingGates() }))
    expect(result.g1RegressionsEmpty).toBe(true)
  })
})

describe('evaluateGates - G2 accuracy must not fall (SC-004)', () => {
  it('fails when the capability under repair got worse', () => {
    const result = evaluateGates(
      stageWith({
        finalAccuracy: { stem: 0.79, syllable: 0.7 },
        gatesRun: passingGates(),
      }),
    )
    expect(result.g2AccuracyNotLower).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('fails when the *other* capability got worse', () => {
    const result = evaluateGates(
      stageWith({ finalAccuracy: { stem: 0.85, syllable: 0.6 }, gatesRun: passingGates() }),
    )
    expect(result.g2AccuracyNotLower).toBe(false)
    expect(result.failures.join(' ')).toContain('pemenggalan')
  })

  it('accepts an improvement', () => {
    const result = evaluateGates(
      stageWith({
        finalAccuracy: { stem: 0.9, syllable: 0.75 },
        gatesRun: passingGates(),
        gateResults: gateResults(),
      }),
    )
    expect(result.g2AccuracyNotLower).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('treats an unmeasured final accuracy as not an improvement', () => {
    const result = evaluateGates(
      stageWith({
        finalAccuracy: { stem: null, syllable: 0.7 },
        gatesRun: passingGates(),
        gateResults: gateResults(),
      }),
    )
    expect(result.g2AccuracyNotLower).toBe(false)
  })
})

describe('evaluateGates - G3 every gate must have run and passed (SC-014)', () => {
  it('fails when a required gate was never run', () => {
    const result = evaluateGates(stageWith({ gatesRun: [BUILD_FULL_GATE] }))
    expect(result.g3AllGatesPassed).toBe(false)
    expect(result.failures.join(' ')).toContain('npm run typecheck')
  })

  it('fails when the full build was never run', () => {
    const result = evaluateGates(stageWith({ gatesRun: ['npm test', 'npm run lint', 'npm run typecheck'] }))
    expect(result.g3AllGatesPassed).toBe(false)
    expect(result.failures.join(' ')).toContain(BUILD_FULL_GATE)
  })

  it('fails when a gate was run and failed', () => {
    const result = evaluateGates(
      stageWith({ gatesRun: passingGates(), gateResults: gateResults('fail') }),
    )
    expect(result.g3AllGatesPassed).toBe(false)
  })

  it('passes when all four gates passed', () => {
    const result = evaluateGates(
      stageWith({ gatesRun: passingGates(), gateResults: gateResults() }),
    )
    expect(result.passed).toBe(true)
  })
})

describe('assertPromotable - verify cannot be skipped', () => {
  it('rejects promotion of an in-progress stage', () => {
    expect(() => assertPromotable(stageWith({ status: 'in-progress' }))).toThrow(StageError)
    expect(() => assertPromotable(stageWith({ status: 'in-progress' }))).toThrow(/status saat ini/)
  })

  it('rejects promotion of a failed stage', () => {
    expect(() => assertPromotable(stageWith({ status: 'failed' }))).toThrow(StageError)
  })

  it('allows promotion of a passed stage', () => {
    expect(() => assertPromotable(stageWith({ status: 'passed' }))).not.toThrow()
  })
})

describe('regression gates - FR-009', () => {
  it('reports a case that no longer holds', () => {
    const result = runRegressionCases([
      { word: 'adukan', capability: 'stem', expected: 'aduk', defectClass: 'over-stripped', stage: 'stage-01', note: '' },
    ])
    // Currently `stem('adukan')` is 'adu', so this is expected to fail until the
    // stage that fixes it is promoted; the point is that it is *detected*.
    expect(result.checked).toBe(1)
    expect(result.failures.length).toBe(1)
    expect(result.failures[0]).toContain('adukan')
  })

  it('skips withdrawn cases instead of pretending they pass', () => {
    const result = runRegressionCases([
      {
        word: 'adukan',
        capability: 'stem',
        expected: 'aduk',
        defectClass: 'over-stripped',
        stage: 'stage-01',
        note: '',
        withdrawn: true,
        withdrawnReason: 'referensi berubah',
      },
    ])
    expect(result.checked).toBe(0)
    expect(result.failures).toEqual([])
  })

  it('passes a case that already holds', () => {
    const result = runRegressionCases([
      { word: 'membantu', capability: 'stem', expected: 'bantu', defectClass: 'affix-strip-missed', stage: 'stage-01', note: '' },
    ])
    expect(result.failures).toEqual([])
  })
})

describe('search join gate - FR-019 level 1 (T045)', () => {
  it('requires the derived form and its root to reduce to the same indexed term', () => {
    const result = runSearchJoinGate([
      { word: 'membantu', capability: 'stem', expected: 'bantu', defectClass: 'affix-strip-missed', stage: 'stage-01', note: '' },
    ])
    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([])
  })

  it('fails when the two forms index to different terms', () => {
    const result = runSearchJoinGate([
      { word: 'bukunya', capability: 'stem', expected: 'buk', defectClass: 'plural-root', stage: 'stage-01', note: '' },
    ])
    expect(result.failures.length).toBe(1)
    expect(result.failures[0]).toContain('bukunya')
  })

  it('ignores hyphenation cases, which have no search-join semantics', () => {
    const result = runSearchJoinGate([
      { word: 'pintar', capability: 'syllable', expected: 'pin-tar', defectClass: 'syllable-boundary-shift', stage: 'stage-01', note: '' },
    ])
    expect(result.checked).toBe(0)
  })
})

describe('filterNonFailureDefects - pure filter logic', () => {
  function defect(overrides: Partial<Defect> = {}): Defect {
    return {
      word: 'test',
      capability: 'syllable',
      pluginOutput: 'test',
      referenceOutput: 'test',
      class: 'reference-missing',
      stratum: null,
      kelasKata: [],
      source: 'snapshot',
      triageNote: '',
      contractLocked: false,
      status: 'open',
      stage: null,
      firstSeenRun: 'test',
      ...overrides,
    }
  }

  it('matches non-failure findings with open status and null stage', () => {
    const defects = [
      defect({ word: 'antui' }),
      defect({ word: 'mengingkari' }),
    ]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'reference-missing',
    })
    expect(result).toHaveLength(2)
  })

  it('ignores findings with non-null stage', () => {
    const defects = [defect({ word: 'antui', stage: 'stage-01' })]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'reference-missing',
    })
    expect(result).toHaveLength(0)
  })

  it('ignores findings with wrong capability', () => {
    const defects = [defect({ word: 'antui', capability: 'stem' })]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'reference-missing',
    })
    expect(result).toHaveLength(0)
  })

  it('ignores findings that are not open', () => {
    const defects = [defect({ word: 'antui', status: 'fixed' })]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'reference-missing',
    })
    expect(result).toHaveLength(0)
  })

  it('respects words filter when provided', () => {
    const defects = [
      defect({ word: 'antui' }),
      defect({ word: 'mengingkari' }),
    ]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'reference-missing',
      words: ['antui'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.word).toBe('antui')
  })

  it('matches data-divergence class', () => {
    const defects = [defect({ word: 'antui', class: 'data-divergence' })]
    const result = filterNonFailureDefects(defects, {
      capability: 'syllable',
      class: 'data-divergence',
    })
    expect(result).toHaveLength(1)
  })
})

describe('triageNonFailureFindings - file I/O wrapper', () => {
  beforeEach(() => {
    mocks.loadDefectStore.mockReset()
    mocks.writeDefectStore.mockReset()
    mocks.writeDefectStore.mockResolvedValue(undefined)
  })

  it('rejects empty reason with StageError', async () => {
    await expect(
      triageNonFailureFindings({
        capability: 'syllable',
        class: 'reference-missing',
        reason: '',
      }),
    ).rejects.toThrow(StageError)
    await expect(
      triageNonFailureFindings({
        capability: 'syllable',
        class: 'reference-missing',
        reason: '   ',
      }),
    ).rejects.toThrow(/alasan wajib diisi/)
  })

  it('throws when no findings match', async () => {
    mocks.loadDefectStore.mockResolvedValue([])
    await expect(
      triageNonFailureFindings({
        capability: 'syllable',
        class: 'reference-missing',
        reason: 'test',
      }),
    ).rejects.toThrow(/tidak ada temuan terbuka/)
  })

  it('writes dismissed findings to store', async () => {
    const defect: Defect = {
      word: 'antui',
      capability: 'syllable',
      pluginOutput: 'an-tui',
      referenceOutput: 'an.tui',
      class: 'reference-missing',
      stratum: null,
      kelasKata: [],
      source: 'snapshot',
      triageNote: '',
      contractLocked: false,
      status: 'open',
      stage: null,
      firstSeenRun: 'test',
    }
    mocks.loadDefectStore.mockResolvedValue([defect])

    const result = await triageNonFailureFindings({
      capability: 'syllable',
      class: 'reference-missing',
      reason: 'Kata tidak ditemukan di kamus.',
    })

    expect(result).toHaveLength(1)
    expect(mocks.writeDefectStore).toHaveBeenCalledTimes(1)
    const written = mocks.writeDefectStore.mock.calls[0]?.[0] as Defect[]
    expect(written[0]?.status).toBe('dismissed')
    expect(written[0]?.withdrawnReason).toBe('Kata tidak ditemukan di kamus.')
  })
})

describe('reconcileNonReproducing (T017, FR-001, SC-001)', () => {
  function defect(overrides: Partial<Defect> = {}): Defect {
    return {
      word: 'kata',
      capability: 'stem',
      pluginOutput: 'x',
      referenceOutput: 'y',
      class: 'candidate-bug',
      stratum: null,
      kelasKata: [],
      source: 'snapshot',
      triageNote: '',
      contractLocked: false,
      status: 'open',
      stage: null,
      firstSeenRun: 'test',
      ...overrides,
    }
  }

  it('marks an open failure-class finding fixed when it no longer reproduces', () => {
    const { reconciled, fixed } = reconcileNonReproducing(
      [defect({ word: 'hilang' })],
      () => false,
    )

    expect(reconciled[0]?.status).toBe('fixed')
    expect(fixed).toEqual(['hilang'])
  })

  it('leaves a still-reproducing failure finding open', () => {
    const { reconciled, fixed } = reconcileNonReproducing([defect({ word: 'masih' })], () => true)

    expect(reconciled[0]?.status).toBe('open')
    expect(fixed).toEqual([])
  })

  it('never touches non-failure, staged, or already-closed findings', () => {
    const defects = [
      defect({ word: 'a', class: 'reference-missing' }),
      defect({ word: 'b', class: 'candidate-bug', stage: 'stage-01' }),
      defect({ word: 'c', class: 'candidate-bug', status: 'dismissed' }),
      defect({ word: 'd', class: 'candidate-bug', status: 'fixed' }),
    ]

    const { reconciled, fixed } = reconcileNonReproducing(defects, () => false)

    expect(reconciled.map((entry) => entry.status)).toEqual(['open', 'open', 'dismissed', 'fixed'])
    expect(fixed).toEqual([])
  })

  it('uses the real reproduction check by default', () => {
    // An empty reference can never equal a real canonical output, so the word
    // still reproduces and must stay open.
    const { reconciled } = reconcileNonReproducing([defect({ word: 'kata', referenceOutput: '' })])

    expect(reconciled[0]?.status).toBe('open')
  })
})