/**
 * T023 - Stemming golden-list test (FR-011, FR-012, SC-006).
 *
 * The fixture is a curated list of Indonesian derived words with their real,
 * verifiable root forms. SC-006 requires the engine to match at least 85% of
 * the list; the list is curated so false positives are excluded while genuine
 * roots must all hold (no invented roots).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stem } from '../../src/core/stem'

const GOLDEN = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/stem-golden.json'), 'utf8'),
) as Array<[string, string]>

describe('stem - 50-word golden list (SC-006)', () => {
  it('has at least 50 curated pairs', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(50)
  })

  it('meets or exceeds the 85% accuracy bar', () => {
    const correct = GOLDEN.filter(([word, root]) => stem(word) === root).length
    const ratio = correct / GOLDEN.length
    expect(
      ratio,
      `${correct}/${GOLDEN.length} correct - below the 85% SC-006 bar`,
    ).toBeGreaterThanOrEqual(0.85)
  })

  it('every recorded pair stems to the recorded root', () => {
    for (const [word, root] of GOLDEN) {
      expect(stem(word), `stem('${word}')`).toBe(root)
    }
  })
})