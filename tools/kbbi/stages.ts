/**
 * Fix stages and the regression gates (T027-T030, T032, T044, T045, FR-008
 * s.d. FR-010, FR-019, FR-022, SC-003, SC-004, SC-014).
 *
 * This module owns the word "bertahap". A stage is small on purpose - at most
 * 20 findings, one capability - and it cannot be declared successful by
 * assertion. Three gates must all hold, and the third one is deliberately the
 * most expensive: a full playground build, once per stage, never per attempt.
 *
 * `promote` is the only place a finding becomes permanent, so it is also where
 * the contract-alignment duty is enforced (FR-023): a finding that would move a
 * published contract value, a golden fixture entry, or the override table may
 * still be fixed, but only in a change that also aligns the contract and leaves
 * a reason in `spec.md`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  DEFECTS_DIR,
  REGRESSION_CASES_PATH,
  REGRESSION_FIXTURE,
  REPO_ROOT,
  STAGE_DIR,
  stagePath,
} from './paths.ts'
import {
  countsFailure,
  defectKey,
  detectContractLock,
  loadDefectStore,
  writeDefectStore,
  type Defect,
} from './compare.ts'
import { stem } from '../../src/core/stem.ts'
import { syllabify } from '../../src/core/syllabify.ts'
import { processToken } from '../../src/core/pipeline.ts'
import { canonicalPluginHyphenation, canonicalWord } from './corpus.ts'
import type {
  AccuracyPair,
  Capability,
  DefectClass,
  GateEvaluation,
  RegressionCase,
  Stage,
} from './types.ts'

/** SC-003: hard cap on findings per stage. */
export const MAX_DEFECTS_PER_STAGE = 20

/** Full-build verification, once per stage (FR-019 level 2, SC-014). */
export const BUILD_FULL_GATE = 'build-full'

/** Gates `verify` requires before it will consider a stage passed. */
export const REQUIRED_GATES: readonly string[] = ['npm test', 'npm run lint', 'npm run typecheck']

export class StageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StageError'
  }
}

function accuracyPair(stemAccuracy: number | null, syllableAccuracy: number | null): AccuracyPair {
  return { stem: stemAccuracy, syllable: syllableAccuracy }
}

// --- stage construction ------------------------------------------------------

/** One finding as `plan` sees it, before a stage exists. */
export interface StageableDefect {
  word: string
  capability: Capability
  class: DefectClass
}

/**
 * Build a stage, refusing every shape that `contracts/stage-workflow.md` forbids.
 *
 * The checks are here rather than in the caller so that no other entry point -
 * a future subcommand, a test, a script - can construct an invalid stage by
 * assembling the object literal itself.
 */
export function buildStage(input: {
  id: string
  createdAt: string
  capability: Capability
  defects: readonly StageableDefect[]
  baselineAccuracy: AccuracyPair
}): Stage {
  if (input.defects.length > MAX_DEFECTS_PER_STAGE) {
    throw new StageError(
      `tahap ${input.id} ditolak: ${input.defects.length} temuan melebihi batas ` +
        `${MAX_DEFECTS_PER_STAGE} per tahap (SC-003). Turunkan --max.`,
    )
  }
  if (input.defects.length === 0) {
    throw new StageError(`tahap ${input.id} ditolak: tidak ada temuan yang boleh dikerjakan.`)
  }

  const foreign = input.defects.filter((defect) => defect.capability !== input.capability)
  if (foreign.length > 0) {
    throw new StageError(
      `tahap ${input.id} ditolak: satu tahap hanya boleh satu kapabilitas ` +
        `("${input.capability}"), tetapi memuat ${foreign.length} temuan kapabilitas lain ` +
        `(${[...new Set(foreign.map((defect) => defect.capability))].join(', ')}). ` +
        `Akar kata dan pemenggalan punya penyebab berbeda.`,
    )
  }

  const notFixable = input.defects.filter((defect) => !countsFailure(defect.class))
  if (notFixable.length > 0) {
    throw new StageError(
      `tahap ${input.id} ditolak: ${notFixable.length} temuan tidak dihitung kegagalan ` +
        `(${notFixable.map((defect) => defect.class).join(', ')}). ` +
        `Kelas itu ditutup lewat triase, bukan lewat perbaikan kode (FR-022).`,
    )
  }

  const duplicates = input.defects.filter(
    (defect, index) => input.defects.findIndex((other) => other.word === defect.word) !== index,
  )
  if (duplicates.length > 0) {
    throw new StageError(
      `tahap ${input.id} ditolak: kata berulang (${duplicates
        .map((defect) => defect.word)
        .join(', ')}).`,
    )
  }

  return {
    id: input.id,
    createdAt: input.createdAt,
    capability: input.capability,
    defects: input.defects.map((defect) => defect.word),
    baselineAccuracy: input.baselineAccuracy,
    finalAccuracy: input.baselineAccuracy,
    regressions: [],
    gatesRun: [],
    gateResults: {},
    status: 'in-progress',
  }
}

/** Next sequential stage id, with no gaps (`stage-01`, `stage-02`, ...). */
export function nextStageId(existing: readonly string[]): string {
  let highest = 0
  for (const id of existing) {
    const match = /^stage-(\d+)$/.exec(id)
    if (match?.[1]) highest = Math.max(highest, Number.parseInt(match[1], 10))
  }
  return `stage-${String(highest + 1).padStart(2, '0')}`
}

// --- gates -------------------------------------------------------------------

function notLower(final: number | null, baseline: number | null): boolean {
  if (baseline === null) return true
  if (final === null) return false
  return final >= baseline
}

/**
 * G1 regressions empty, G2 accuracy not lower on **both** capabilities, G3 every
 * recorded gate passed including one full build.
 *
 * G2 checks the capability the stage did not touch as well. A stem-only fix
 * that quietly lowers hyphenation accuracy fails the stage - that regression
 * would otherwise only surface several stages later, by which point the cause
 * is hard to find.
 */
export function evaluateGates(stage: Stage): GateEvaluation {
  const failures: string[] = []

  const g1 = stage.regressions.length === 0
  if (!g1) failures.push(`G1 gagal: ${stage.regressions.length} regresi (${stage.regressions.join(', ')})`)

  const g2stem = notLower(stage.finalAccuracy.stem, stage.baselineAccuracy.stem)
  const g2syllable = notLower(stage.finalAccuracy.syllable, stage.baselineAccuracy.syllable)
  const g2 = g2stem && g2syllable
  if (!g2) {
    if (!g2stem) {
      failures.push(
        `G2 gagal: akurasi akar kata turun dari ${stage.baselineAccuracy.stem} menjadi ${stage.finalAccuracy.stem}`,
      )
    }
    if (!g2syllable) {
      failures.push(
        `G2 gagal: akurasi pemenggalan turun dari ${stage.baselineAccuracy.syllable} menjadi ${stage.finalAccuracy.syllable}`,
      )
    }
  }

  const missingRequired = REQUIRED_GATES.filter((gate) => !stage.gatesRun.includes(gate))
  const missingBuild = !stage.gatesRun.includes(BUILD_FULL_GATE)
  const failingGates = stage.gatesRun.filter((gate) => stage.gateResults[gate] !== 'pass')
  const g3 = missingRequired.length === 0 && !missingBuild && failingGates.length === 0
  if (!g3) {
    if (missingRequired.length > 0) {
      failures.push(`G3 gagal: gerbang belum dijalankan: ${missingRequired.join(', ')}`)
    }
    if (missingBuild) {
      failures.push(
        `G3 gagal: tidak ada satu entri \`${BUILD_FULL_GATE}\` pada gatesRun ` +
          `(FR-019 tingkat 2, SC-014). Verifikasi build penuh wajib sekali per tahap.`,
      )
    }
    if (failingGates.length > 0) failures.push(`G3 gagal: gerbang gagal: ${failingGates.join(', ')}`)
  }

  return {
    g1RegressionsEmpty: g1,
    g2AccuracyNotLower: g2,
    g3AllGatesPassed: g3,
    passed: g1 && g2 && g3,
    failures,
  }
}

/** `promote` refuses anything that has not actually passed (stage-workflow). */
export function assertPromotable(stage: Stage): void {
  if (stage.status !== 'passed') {
    throw new StageError(
      `promote ditolak untuk ${stage.id}: status saat ini "${stage.status}". ` +
        `Jalankan \`verify\` lebih dulu; melewati verify dan langsung promote ditolak.`,
    )
  }
}

// --- regression cases --------------------------------------------------------

/** Run every stored case through the current code. Words that fail are G1. */
export function runRegressionCases(
  cases: readonly RegressionCase[],
): { failures: string[]; checked: number } {
  const failures: string[] = []
  let checked = 0
  for (const regression of cases) {
    if (regression.withdrawn) continue
    checked++
    const actual =
      regression.capability === 'stem'
        ? canonicalWord(stem(regression.word))
        : canonicalPluginHyphenation(syllabify(regression.word))
    if (actual !== regression.expected) {
      failures.push(
        `${regression.word}: diharapkan ${regression.expected}, ditemukan ${actual} ` +
          `(${regression.capability}, ${regression.defectClass})`,
      )
    }
  }
  return { failures, checked }
}

/** Gate name for the fast, always-on level-1 search check (FR-019, T044/T045). */
export const SEARCH_UNIT_GATE = 'search-unit'

/**
 * Level-1 search verification: the quick check that runs with every ordinary
 * test suite, without a playground build.
 *
 * It asserts the actual user-visible property rather than a proxy: the shared
 * pipeline must reduce the derived form and its root to the *same* indexed term,
 * because `createIndex` and `search` both route through `processToken`. When
 * the two terms differ, searching the root cannot find a document containing
 * the derived form - which is exactly the regression US5 exists to prevent.
 *
 * A case whose root is a stop word (`aku`) cannot join by construction: the
 * pipeline drops it at both index and query time, and that is the documented,
 * intended behaviour rather than a regression. Those are counted as skipped,
 * never as failures - otherwise a correct finding could never be promoted.
 */
export function runSearchJoinGate(
  cases: readonly RegressionCase[],
): { failures: string[]; checked: number; skipped: number } {
  const failures: string[] = []
  let checked = 0
  let skipped = 0
  for (const regression of cases) {
    if (regression.withdrawn || regression.capability !== 'stem') continue
    const fromWord = processToken(regression.word)
    const fromRoot = processToken(regression.expected)
    if (fromWord === null || fromRoot === null) {
      skipped++
      continue
    }
    checked++
    if (fromWord !== fromRoot) {
      failures.push(
        `${regression.word}: reduce kata=${fromWord} vs akar=${fromRoot} - ` +
          `pencarian dua arah tidak akan menemukan dokumen yang diharapkan`,
      )
    }
  }
  return { failures, checked, skipped }
}

export async function loadRegressionCases(): Promise<RegressionCase[]> {
  try {
    const parsed = JSON.parse(await readFile(REGRESSION_CASES_PATH, 'utf8')) as unknown
    return Array.isArray(parsed) ? (parsed as RegressionCase[]) : []
  } catch {
    return []
  }
}

export async function writeRegressionCases(cases: readonly RegressionCase[]): Promise<void> {
  await mkdir(DEFECTS_DIR, { recursive: true })
  await writeFile(REGRESSION_CASES_PATH, `${JSON.stringify(cases, null, 2)}\n`, 'utf8')
}

/**
 * Curated fixture form: the same `[word, expected]` array shape as
 * `stem-golden.json`. Withdrawn cases are dropped from the fixture but stay in
 * `.kbbi/` with their reason (FR-022: nothing is deleted silently).
 */
export async function writeCuratedFixtures(cases: readonly RegressionCase[]): Promise<void> {
  for (const capability of ['stem', 'syllable'] as const) {
    const pairs: Array<[string, string]> = cases
      .filter((regression) => regression.capability === capability && !regression.withdrawn)
      .map((regression) => [regression.word, regression.expected] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]))
    await writeFile(REGRESSION_FIXTURE[capability], `${JSON.stringify(pairs, null, 2)}\n`, 'utf8')
  }
}

// --- contract alignment (FR-023, SC-013, T032) -------------------------------

const SPEC_PATH = `${REPO_ROOT}/specs/002-validasi-kbbi-berbertahap/spec.md`

/**
 * The triage note a `contract-locked` finding must carry (FR-023): which
 * contract, fixture or override table moves, the old and new values, and why
 * KBBI is treated as the authority. Without all three, the stage gate rejects it.
 */
function contractLockNote(source: string, defect: Defect): string {
  return (
    `Perbaikan mengubah hasil yang tertuang pada ${source}: ` +
    `nilai lama ${defect.pluginOutput || '(kosong)'}, nilai baru ${defect.referenceOutput}. ` +
    `KBBI diperlakukan sebagai otoritas terakhir atas kebenaran linguistik, ` +
    `jadi kontrak, fixture, dan test wajib diselaraskan pada perubahan yang sama.`
  )
}

export interface AlignmentProblem {
  word: string
  reason: string
}

/**
 * A `contract-locked` finding is allowed through - KBBI wins - but only as part
 * of a change that also aligns the published promise. Two things are checked
 * mechanically: the author named the files they aligned, and the word appears in
 * a `## Clarifications` entry. A missing entry names the word; a missing
 * `--contract-updated` names the contract.
 */
export async function checkContractAlignment(
  defects: readonly Defect[],
  contractUpdated: readonly string[],
): Promise<AlignmentProblem[]> {
  const locked = defects.filter((defect) => defect.contractLocked)
  if (locked.length === 0) return []

  const problems: AlignmentProblem[] = []
  let spec = ''
  try {
    spec = await readFile(SPEC_PATH, 'utf8')
  } catch {
    spec = ''
  }
  const clarifications = /##\s*Clarifications([\s\S]*)$/.exec(spec)?.[1] ?? ''

  for (const defect of locked) {
    const reason = /pada ([^:]+):/.exec(defect.triageNote)?.[1]?.trim()
    const mentioned = contractUpdated.some((entry) => reason && entry.includes(reason))
    if (!mentioned) {
      problems.push({
        word: defect.word,
        reason:
          `kontrak/fixture belum diselaraskan: ${reason ?? 'sumber nilainya tidak diketahui'}. ` +
          `Sebutkan berkas yang diperbarui dengan --contract-updated.`,
      })
    }
    if (!clarifications.includes(defect.word)) {
      problems.push({
        word: defect.word,
        reason:
          `belum ada entri alasan untuk kata "${defect.word}" pada bagian ` +
          `## Clarifications di specs/002-validasi-kbbi-berbertahap/spec.md (FR-023, SC-013).`,
      })
    }
  }
  return problems
}

// --- persistence -------------------------------------------------------------

export async function loadStage(id: string): Promise<Stage> {
  try {
    const parsed = JSON.parse(await readFile(stagePath(id), 'utf8')) as Stage
    if (parsed.gateResults === undefined) parsed.gateResults = {}
    return parsed
  } catch {
    throw new StageError(
      `tahap ${id} tidak ditemukan di ${STAGE_DIR}. Jalankan \`plan\` lebih dulu.`,
    )
  }
}

export async function saveStage(stage: Stage): Promise<void> {
  await mkdir(STAGE_DIR, { recursive: true })
  await writeFile(stagePath(stage.id), `${JSON.stringify(stage, null, 2)}\n`, 'utf8')
}

export async function listStageIds(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  try {
    const entries = await readdir(STAGE_DIR)
    return entries
      .filter((name) => name.startsWith('stage-') && name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort()
  } catch {
    return []
  }
}

/** Latest measurement accuracy per capability, used as the stage baseline. */
export interface AccuracySource {
  stem: number | null
  syllable: number | null
}

export function emptyAccuracy(): AccuracySource {
  return accuracyPair(null, null)
}

/**
 * Does this stored finding still reproduce under the current code?
 *
 * The store is append-only: a finding that has since been fixed keeps its row
 * (the record of what was wrong is worth more than a tidy table). That makes
 * liveness a separate question, and `plan` has to ask it - otherwise a stage
 * would be built from findings the code no longer has, and the stage could
 * never reach "all of these are fixed".
 */
export function isStillReproducing(defect: Defect): boolean {
  const actual =
    defect.capability === 'stem'
      ? canonicalWord(stem(defect.word))
      : canonicalPluginHyphenation(syllabify(defect.word))
  return actual !== defect.referenceOutput
}

/**
 * FR-001/SC-001 (T017): an open failure-class finding the current code no longer
 * reproduces has no closure path anywhere else - `planStage` only selects
 * still-reproducing findings, `triage` handles non-failure classes only, and
 * `dismiss` requires stage membership. Left alone it stays `open` forever, so
 * `measure` reconciles it to `fixed`, the same end state `promote` records.
 *
 * The reproduction predicate is injectable so the mapping is testable without
 * invoking the stemmer; the default is the real check.
 */
export function reconcileNonReproducing(
  defects: readonly Defect[],
  reproduces: (defect: Defect) => boolean = isStillReproducing,
): { reconciled: Defect[]; fixed: string[] } {
  const fixed: string[] = []
  const reconciled = defects.map((defect) => {
    if (
      defect.status === 'open' &&
      defect.stage === null &&
      countsFailure(defect.class) &&
      !reproduces(defect)
    ) {
      fixed.push(defect.word)
      return { ...defect, status: 'fixed' as const }
    }
    return defect
  })
  return { reconciled, fixed }
}

/**
 * `plan --capability X --max N`: pick the highest-signal open findings, honouring
 * the 20-per-stage cap and the failure-only rule. Order is deterministic -
 * alphabetical by word - so a re-plan over unchanged findings yields the same
 * stage (FR-013).
 */
export async function planStage(input: {
  capability: Capability
  max: number
  baselineAccuracy: AccuracySource
  createdAt: string
  store?: readonly Defect[]
}): Promise<Stage> {
  if (input.max > MAX_DEFECTS_PER_STAGE) {
    throw new StageError(
      `--max ${input.max} melebihi batas ${MAX_DEFECTS_PER_STAGE} temuan per tahap (SC-003).`,
    )
  }
  const store = input.store ?? (await loadDefectStore())
  const candidates = store
    .filter(
      (defect) =>
        defect.capability === input.capability &&
        defect.status === 'open' &&
        defect.stage === null &&
        countsFailure(defect.class) &&
        isStillReproducing(defect),
    )
    .sort((a, b) => a.word.localeCompare(b.word))
    .slice(0, Math.max(0, input.max))

  const stage = buildStage({
    id: nextStageId(await listStageIds()),
    createdAt: input.createdAt,
    capability: input.capability,
    defects: candidates.map((defect) => ({
      word: defect.word,
      capability: defect.capability,
      class: defect.class,
    })),
    baselineAccuracy: input.baselineAccuracy,
  })

  const byKey = new Set(
    stage.defects.map((word) => `${word}\u0000${stage.capability}`),
  )
  const updated = store.map((defect) =>
    byKey.has(`${defect.word}\u0000${stage.capability}`) ? { ...defect, stage: stage.id } : defect,
  )
  await writeDefectStore(updated)
  await saveStage(stage)
  return stage
}

/** Re-run G1-G3 for a stage and persist the verdict. */
export async function verifyStage(
  stage: Stage,
  finalAccuracy: AccuracySource,
  regressionFailures: readonly string[],
): Promise<{ stage: Stage; evaluation: GateEvaluation }> {
  const next: Stage = {
    ...stage,
    finalAccuracy,
    regressions: [...regressionFailures],
  }
  const evaluation = evaluateGates(next)
  next.status = evaluation.passed ? 'passed' : 'failed'
  await saveStage(next)
  return { stage: next, evaluation }
}

/** Record the outcome of one manually-run gate (`npm test`, lint, build-full). */
export async function recordGate(
  stage: Stage,
  gate: string,
  result: 'pass' | 'fail',
): Promise<Stage> {
  const gatesRun = stage.gatesRun.includes(gate) ? stage.gatesRun : [...stage.gatesRun, gate]
  const next: Stage = { ...stage, gatesRun, gateResults: { ...stage.gateResults, [gate]: result } }
  if (result === 'fail' && next.status === 'passed') next.status = 'failed'
  await saveStage(next)
  return next
}

/**
 * Close findings inside a stage with a recorded reason instead of a code change
 * (FR-022).
 *
 * A finding that no algorithm in this package can explain - because explaining
 * it needs lexical data the package may not carry (FR-021) - must not be left
 * open with no explanation, and must not be "fixed" by guessing. Dismissing it
 * records who decided, for which words, on what technical grounds, and keeps the
 * baseline accuracy in force from that moment on.
 *
 * `promote` skips dismissed findings, so a stage can legitimately mix fixed and
 * triaged findings.
 */
export async function dismissStageFindings(
  stage: Stage,
  words: readonly string[],
  reason: string,
): Promise<Defect[]> {
  if (reason.trim().length === 0) {
    throw new StageError('alasan wajib diisi: penolakan tanpa alasan melanggar FR-022.')
  }
  const wanted = new Set(words)
  const store = await loadDefectStore()
  const dismissed: Defect[] = []
  const updated = store.map((defect) => {
    if (
      defect.stage !== stage.id ||
      defect.capability !== stage.capability ||
      !wanted.has(defect.word) ||
      defect.status !== 'open'
    ) {
      return defect
    }
    dismissed.push(defect)
    return {
      ...defect,
      status: 'dismissed' as const,
      withdrawnReason: reason,
      triageNote: `Ditutup lewat triase pada ${stage.id}: ${reason}`,
    }
  })
  if (dismissed.length === 0) {
    throw new StageError(
      `tidak ada temuan terbuka milik ${stage.id} untuk kata: ${words.join(', ')}.`,
    )
  }
  await writeDefectStore(updated)
  return dismissed
}

/**
 * Pure filter: which non-failure findings match the triage criteria.
 * Separated from file I/O so it is unit-testable without mocking the store.
 */
export function filterNonFailureDefects(
  defects: readonly Defect[],
  input: {
    capability: Capability
    class: DefectClass
    words?: readonly string[]
  },
): Defect[] {
  const wanted = input.words && input.words.length > 0 ? new Set(input.words) : null
  return defects.filter(
    (defect) =>
      defect.capability === input.capability &&
      defect.class === input.class &&
      defect.status === 'open' &&
      defect.stage === null &&
      (wanted === null || wanted.has(defect.word)),
  )
}

/**
 * Close non-failure findings without requiring stage membership.
 *
 * Non-failure classes (`reference-missing`, `data-divergence`, `root-word-self`)
 * can never enter a fix stage (`planStage` filters by `countsFailure`), and
 * `dismissStageFindings` requires `stage` membership. This function closes them
 * directly with a recorded reason (FR-022).
 */
export async function triageNonFailureFindings(input: {
  capability: Capability
  class: DefectClass
  words?: readonly string[]
  reason: string
}): Promise<Defect[]> {
  if (input.reason.trim().length === 0) {
    throw new StageError('alasan wajib diisi: penolakan tanpa alasan melanggar FR-022')
  }
  const store = await loadDefectStore()
  const matching = filterNonFailureDefects(store, input)
  if (matching.length === 0) {
    throw new StageError(
      `tidak ada temuan terbuka dengan kelas ${input.class} untuk kapabilitas ${input.capability}`,
    )
  }
  const dismissedSet = new Set(matching.map((defect) => `${defect.capability} ${defect.word} ${defect.referenceOutput}`))
  const updated = store.map((defect) => {
    if (!dismissedSet.has(`${defect.capability} ${defect.word} ${defect.referenceOutput}`)) {
      return defect
    }
    return {
      ...defect,
      status: 'dismissed' as const,
      withdrawnReason: input.reason,
      triageNote: `Ditutup lewat triase non-kegagalan: ${input.reason}`,
    }
  })
  await writeDefectStore(updated)
  return matching
}

/**
 * Promote a passed stage: findings become `fixed`, each one becomes a permanent
 * regression case (FR-009), and the curated fixtures are rewritten.
 */
export async function promoteStage(
  stage: Stage,
  options: { contractUpdated?: readonly string[] } = {},
): Promise<{ fixed: Defect[]; cases: RegressionCase[] }> {
  assertPromotable(stage)

  const store = await loadDefectStore()
  const inStage = store.filter(
    (defect) => stage.defects.includes(defect.word) && defect.capability === stage.capability,
  )
  if (inStage.length === 0) {
    throw new StageError(`tahap ${stage.id} ditolak: tidak ada temuan terbuka untuk dipromosikan.`)
  }

  // Findings triaged away (FR-022) are not promoted - they were never fixed.
  const dismissed = new Set(
    inStage.filter((defect) => defect.status === 'dismissed').map((defect) => defect.word),
  )
  const targeted = inStage.filter((defect) => defect.status === 'open')

  // A finding can only be called fixed if the code no longer reproduces it.
  // Without this check `promote` would happily turn a still-failing word into a
  // permanent regression case, which is the one outcome the gate exists to stop.
  const stillFailing = targeted.filter((defect) => isStillReproducing(defect))
  if (stillFailing.length > 0) {
    throw new StageError(
      `promote ditolak untuk ${stage.id}: ${stillFailing.length} temuan masih tereproduksi ` +
        `(${stillFailing.map((defect) => defect.word).join(', ')}). ` +
        `Perbaiki dulu, atau tutup dengan \`dismiss\` beserta alasan teknisnya (FR-022).`,
    )
  }

  // The lock is re-evaluated here rather than trusted from the stored row: the
  // fixtures and the contract may have moved between measurement and promotion,
  // and the gate has to judge what is true now.
  const evaluated = await Promise.all(
    targeted.map(async (defect) => {
      const lock = await detectContractLock(
        defect.capability,
        defect.word,
        defect.pluginOutput,
        defect.referenceOutput,
      )
      return { defect, lock }
    }),
  )
  const problems = await checkContractAlignment(
    evaluated
      .filter((entry) => entry.lock.contractLocked)
      .map((entry) => ({
        ...entry.defect,
        contractLocked: true,
        triageNote: contractLockNote(entry.lock.source, entry.defect),
      })),
    options.contractUpdated ?? [],
  )
  if (problems.length > 0) {
    const details = problems.map((problem) => `${problem.word}: ${problem.reason}`).join(' | ')
    throw new StageError(
      `promote ditolak untuk ${stage.id}: ${problems.length} temuan contract-locked belum ` +
        `selaras dengan kontrak, fixture, dan jejak alasan. ${details}`,
    )
  }

  const fixed: Defect[] = targeted.map((defect) => ({ ...defect, status: 'fixed', stage: stage.id }))
  const byKey = new Map(fixed.map((defect) => [defectKey(defect), defect]))
  const merged = store.map((defect) => byKey.get(defectKey(defect)) ?? defect)
  await writeDefectStore(merged)

  const existing = await loadRegressionCases()
  const existingKeys = new Set(
    existing.filter((regression) => !regression.withdrawn).map((regression) => regression.word),
  )
  const added: RegressionCase[] = []
  for (const defect of fixed) {
    if (existingKeys.has(defect.word)) continue
    added.push({
      word: defect.word,
      capability: defect.capability,
      expected: defect.referenceOutput,
      defectClass: defect.class,
      stage: stage.id,
      note: defect.triageNote || `Diperbaiki pada ${stage.id}.`,
    })
  }
  const cases = [...existing, ...added]
  await writeRegressionCases(cases)
  await writeCuratedFixtures(cases)

  const promoted: Stage = { ...stage, status: 'passed' }
  await saveStage(promoted)
  void dismissed
  return { fixed, cases: added }
}

/**
 * Revert a failed stage: findings go back to `open`, their stage link is cleared,
 * and any regression case this stage created is withdrawn **with a recorded
 * reason** rather than deleted (FR-022).
 */
export async function revertStage(
  stage: Stage,
  reason: string,
): Promise<{ withdrawn: RegressionCase[] }> {
  const store = await loadDefectStore()
  const reverted = store.map((defect) =>
    defect.stage === stage.id ? { ...defect, status: 'open' as const, stage: null } : defect,
  )
  await writeDefectStore(reverted)

  const cases = await loadRegressionCases()
  const withdrawn = cases.filter((regression) => regression.stage === stage.id && !regression.withdrawn)
  const marked: RegressionCase[] = cases.map((regression) =>
    regression.stage === stage.id && !regression.withdrawn
      ? { ...regression, withdrawn: true, withdrawnReason: reason }
      : regression,
  )
  await writeRegressionCases(marked)
  await writeCuratedFixtures(marked)

  const next: Stage = { ...stage, status: 'failed' }
  await saveStage(next)
  return { withdrawn }
}

export { DEFECTS_DIR }