/**
 * T057: the emitted JSONL line must match the key order `contracts/report-format.md`
 * fixes. That example previously omitted `contractLocked` (and `data-model.md` §4
 * omitted `stage`), while the code emitted both - a silent divergence from a
 * contract, which constitution Principle I forbids. A contract example with no
 * test is how that drift survived, so this pins the shape.
 */

import { describe, expect, it } from 'vitest'
import { serializeDefect } from '../../tools/kbbi/compare.ts'
import { renderJsonl } from '../../tools/kbbi/report.ts'
import type { Defect, Measurement } from '../../tools/kbbi/types.ts'

const CONTRACT_KEY_ORDER = [
  'word',
  'capability',
  'pluginOutput',
  'referenceOutput',
  'class',
  'stratum',
  'kelasKata',
  'source',
  'triageNote',
  'status',
  'stage',
  'contractLocked',
  'firstSeenRun',
]

function sampleDefect(): Defect {
  return {
    word: 'memdoctoral',
    capability: 'stem',
    pluginOutput: 'doktor',
    referenceOutput: 'doktoral',
    class: 'affix-strip-missed',
    stratum: null,
    kelasKata: ['v'],
    source: 'snapshot',
    triageNote: 'Sufiks -al belum dilepas',
    contractLocked: false,
    status: 'open',
    stage: null,
    firstSeenRun: 'stem-m-20261007T204500Z',
  }
}

describe('report JSONL shape matches the contract (T057, FR-002, FR-013, FR-023)', () => {
  it('serialises a finding in the exact key order the contract fixes', () => {
    const parsed = JSON.parse(serializeDefect(sampleDefect(), null)) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(CONTRACT_KEY_ORDER)
  })

  it('keeps stage and contractLocked present rather than dropping them', () => {
    const parsed = JSON.parse(serializeDefect(sampleDefect(), null)) as Record<string, unknown>
    expect(parsed.stage).toBeNull()
    expect(parsed.contractLocked).toBe(false)
  })

  it('renderJsonl pins firstSeenRun to null for byte-stable reruns (FR-013)', () => {
    const jsonl = renderJsonl({} as Measurement, [sampleDefect()])
    expect(jsonl.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(jsonl.trim()) as Record<string, unknown>
    expect(parsed.firstSeenRun).toBeNull()
    expect(Object.keys(parsed)).toEqual(CONTRACT_KEY_ORDER)
  })
})
