/**
 * T023 / T034 - Stemming golden-list test (FR-011, FR-012, SC-006).
 *
 * The fixture is a curated list of Indonesian derived words with their real,
 * verifiable root forms, and every recorded pair must stem exactly to the
 * recorded root - no invented roots, no tolerance band.
 *
 * T034 removed a former `ratio >= 0.85` assertion from this file. It was dead
 * logic: the test below it demands that all pairs hold, which already means
 * 100%, so the 85% bar could never fail and only misdescribed what was being
 * enforced. Tolerance, if it is ever wanted, belongs on a measurement report
 * (`.kbbi/reports/`) where the sample size and the failures are both visible -
 * not here, where it would quietly weaken an exact check.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stem } from '../../src/core/stem'

const GOLDEN = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/stem-golden.json'), 'utf8'),
) as Array<[string, string]>

describe('stem - curated golden list (SC-006)', () => {
  it('has at least 50 curated pairs', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(50)
  })

  it('every recorded pair stems to the recorded root', () => {
    for (const [word, root] of GOLDEN) {
      expect(stem(word), `stem('${word}')`).toBe(root)
    }
  })

  it('holds for all pairs at once', () => {
    // The 85% bar that used to live here was unreachable dead logic; the
    // exhaustive assertion above is the whole guarantee.
    const failures = GOLDEN.filter(([word, root]) => stem(word) !== root)
    expect(failures.map(([word, root]) => `${word} -> ${stem(word)} (want ${root})`)).toEqual([])
  })
})