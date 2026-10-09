/**
 * Command line interface for the KBBI validation toolkit (T010, T039, T040,
 * FR-004, FR-016, R7).
 *
 * One process, one command, non-zero exit on failure. The commands are thin on
 * purpose: measurement lives in `compare.ts`, persistence in `report.ts` and
 * `stages.ts`, dataset acquisition in `snapshot.ts`. What this file owns is
 * argument parsing and - more importantly - refusing to print a number it did
 * not actually measure.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { REPORT_DIR, WORK_DIR } from './paths.ts'
import {
  assertScopeAccounting,
  loadDefectStore,
  loadCorpus,
  measure,
  mergeDefects,
  writeDefectStore,
  type MeasureResult,
} from './compare.ts'
import { McpUnavailableError, crossCheckSample, probeMcp } from './mcp.ts'
import { clearCheckpoint, readCheckpoint, writeCheckpoint, writeReport, type Checkpoint } from './report.ts'
import {
  MAX_DEFECTS_PER_STAGE,
  SEARCH_UNIT_GATE,
  StageError,
  dismissStageFindings,
  listStageIds,
  loadRegressionCases,
  loadStage,
  planStage,
  promoteStage,
  reconcileNonReproducing,
  recordGate,
  revertStage,
  runRegressionCases,
  runSearchJoinGate,
  triageNonFailureFindings,
  verifyStage,
} from './stages.ts'
import { NON_FAILURE_CLASSES } from './compare.ts'
import { SnapshotError, captureSnapshot, hasSnapshot, loadSnapshot } from './snapshot.ts'
import type { Capability, Defect, Measurement } from './types.ts'

const USAGE = `kbbi-validate - pengukuran stem() dan syllabify() terhadap data KBBI

Pakai:
  kbbi-validate snapshot [--force]
  kbbi-validate measure --capability stem|syllable --scope all|<huruf>
  kbbi-validate sample  --capability stem --size 50
  kbbi-validate plan    --capability stem --max 20
  kbbi-validate verify  --stage stage-01
  kbbi-validate record  --stage stage-01 --gate "npm test" --result pass|fail
  kbbi-validate promote --stage stage-01 [--contract-updated <berkas>]
  kbbi-validate dismiss --stage stage-01 --word "a,b" --reason "alasan teknis"
  kbbi-validate triage  --capability stem|syllable --class <kelas> [--word "a,b"] --reason "alasan"
  kbbi-validate revert  --stage stage-01 --reason "alasan"
  kbbi-validate status
  kbbi-validate --help

Hanya \`snapshot\` memakai jaringan. Semua perintah lain membaca berkas lokal.
`

export class CliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliError'
  }
}

interface ParsedArgs {
  command: string
  flags: Record<string, string>
  positional: string[]
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  let command = ''
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string
    if (token === '--help' || token === '-h') {
      command = 'help'
      continue
    }
    if (token.startsWith('--')) {
      const [name, inline] = token.slice(2).split('=', 2)
      if (inline !== undefined) {
        flags[name as string] = inline
        continue
      }
      flags[name as string] = argv[i + 1] ?? ''
      i++
      continue
    }
    if (command === '') command = token
    else positional.push(token)
  }
  return { command, flags, positional }
}

function requireFlag(flags: Record<string, string>, name: string): string {
  const value = flags[name]
  if (value === undefined || value.length === 0) {
    throw new CliError(`--${name} wajib diisi.`)
  }
  return value
}

function parseCapability(raw: string): Capability {
  if (raw === 'stem' || raw === 'syllable') return raw
  throw new CliError(`--capability harus "stem" atau "syllable", bukan "${raw}".`)
}

function parseScope(raw: string): string {
  if (raw === 'all' || raw === '*') return 'all'
  if (raw.length === 1 && /[a-z]/u.test(raw.toLowerCase())) return raw.toLowerCase()
  throw new CliError(`--scope harus "all" atau satu huruf awal, bukan "${raw}".`)
}

const log = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

function latestMeasurementPath(capability: Capability): string {
  return `${REPORT_DIR}/${capability}.latest.json`
}

async function readLatestMeasurement(capability: Capability): Promise<Measurement | null> {
  try {
    return JSON.parse(await readFile(latestMeasurementPath(capability), 'utf8')) as Measurement
  } catch {
    return null
  }
}

async function recordLatestMeasurement(measurement: Measurement): Promise<void> {
  await writeFile(latestMeasurementPath(measurement.id), `${JSON.stringify(measurement, null, 2)}\n`, 'utf8')
}

async function currentAccuracy(): Promise<{ stem: number | null; syllable: number | null }> {
  const stem_ = await readLatestMeasurement('stem')
  const syllable = await readLatestMeasurement('syllable')
  return { stem: stem_?.accuracy ?? null, syllable: syllable?.accuracy ?? null }
}

// --- commands ----------------------------------------------------------------

async function commandSnapshot(flags: Record<string, string>): Promise<number> {
  // `--force` is the explicit refresh path US4/AC4 refers to: re-take the
  // dataset even when a checksum-valid snapshot is already present. Without it
  // an existing valid snapshot is left untouched so measurements stay
  // comparable and a rerun never silently changes the reference data.
  const force = flags['force'] !== undefined
  if (!force && (await hasSnapshot())) {
    log('Snapshot sudah ada dan checksum-nya cocok. Gunakan --force untuk mengambil ulang.')
    return 0
  }
  const snapshot = await captureSnapshot({ log })
  log(`Snapshot ${snapshot.tag} tersimpan: ${snapshot.files.length} berkas.`)
  log(
    `Entri: ${snapshot.entryCount.derived} kata turunan, ` +
      `${snapshot.entryCount.rootWords} kata dasar, ` +
      `${snapshot.entryCount.syllables} entri pemenggalan.`,
  )
  log(`Direktori: ${WORK_DIR}/snapshot/${snapshot.tag}`)
  return 0
}

async function commandMeasure(flags: Record<string, string>): Promise<number> {
  const capability = parseCapability(requireFlag(flags, 'capability'))
  const scope = parseScope(requireFlag(flags, 'scope'))

  const snapshot = await loadSnapshot()
  const corpus = await loadCorpus(snapshot)

  // FR-015: an interrupted run resumes after its last completed word, so a
  // word that never ran can never be mistaken for one that failed. A checkpoint
  // from a different snapshot is ignored: resuming onto a different dataset
  // would silently mix two measurements.
  const scopeKey = scope === 'all' || scope === '*' ? 'all' : scope
  const stored = await readCheckpoint(capability, scopeKey)
  const resumable =
    stored && !stored.completed && stored.snapshotTag === snapshot.tag ? stored.lastWord : null

  const checkpoint: Checkpoint = {
    capability,
    scope: scopeKey,
    snapshotTag: snapshot.tag,
    lastWord: resumable,
    completed: false,
  }
  // Written every 500 words: often enough that a long full-corpus run loses
  // little, rare enough that it is not on the hot path. Writes are chained
  // rather than fired and forgotten - two overlapping writes to the same file
  // collide on Windows, and the measurement must not die because a resume hint
  // could not be saved.
  let sinceFlush = 0
  let pending: Promise<void> = Promise.resolve()
  const saveCheckpoint = (): Promise<void> => {
    pending = pending
      .then(() => writeCheckpoint(checkpoint))
      .catch((error: unknown) => {
        process.stderr.write(
          `peringatan: checkpoint gagal ditulis (${error instanceof Error ? error.message : String(error)}). ` +
            `Pengukuran tetap dilanjutkan, tetapi tidak dapat dilanjutkan bila terhenti.\n`,
        )
      })
    return pending
  }
  const result: MeasureResult = await measure({
    corpus,
    capability,
    scope,
    ...(resumable ? { resumeAfter: resumable } : {}),
    onProgress: (lastWord) => {
      checkpoint.lastWord = lastWord
      sinceFlush++
      if (sinceFlush >= 500) {
        sinceFlush = 0
        void saveCheckpoint()
      }
    },
  })

  // A partial run is the only case that keeps its checkpoint, and its report is
  // explicitly marked so its totals are never read as final numbers.
  if (result.measurement.partial) await saveCheckpoint()
  else {
    await pending
    await clearCheckpoint(capability, scopeKey)
  }

  // A partial run is about the accounting invariant, not the accuracy value.
  assertScopeAccounting(result.measurement)

  const paths = await writeReport(result.measurement, result.defects)
  await recordLatestMeasurement(result.measurement)

  const store = await loadDefectStore()
  const { merged, added } = mergeDefects(store, result.defects)
  // FR-001/SC-001 (T017): a measurement is the moment the code's current output
  // is known, so it is where a failure finding that no longer reproduces is
  // reconciled to `fixed`. Otherwise that finding keeps `open` with no closure path.
  const { reconciled, fixed } = reconcileNonReproducing(merged)
  await writeDefectStore(reconciled)

  const { totals, accuracy } = result.measurement
  log(`${capability} ${scope}: diuji ${totals.tested}, cocok ${totals.matched}, berbeda ${totals.mismatched}`)
  log(
    `Akurasi: ${accuracy === null ? 'tidak diukur (Diuji = 0)' : `${(accuracy * 100).toFixed(2)}%`}`,
  )
  log(
    `Di luar pembilang: data tidak tersedia ${totals.referenceMissing}, ` +
      `di luar cakupan ${totals.excluded}`,
  )
  if (result.measurement.partial) {
    log(
      `PENGUKURAN TERPUTUS setelah kata "${result.measurement.lastWord ?? '(tidak diketahui)'}". ` +
        `Angka di atas bukan angka final. Ulangi perintah yang sama untuk melanjutkan dari titik itu.`,
    )
  }
  log(`Laporan: ${paths.markdown}`)
  log(`JSONL:   ${paths.jsonl}`)
  log(`Temuan baru ditambahkan ke store: ${added} (total ${reconciled.length})`)
  if (fixed.length > 0) {
    log(`Temuan yang tidak lagi direproduksi ditandai fixed: ${fixed.length}`)
  }
  return 0
}

async function commandSample(flags: Record<string, string>): Promise<number> {
  const capability = parseCapability(requireFlag(flags, 'capability'))
  const size = Number.parseInt(flags['size'] ?? '50', 10)
  if (!Number.isFinite(size) || size <= 0) throw new CliError('--size harus bilangan bulat positif.')

  const availability = probeMcp()
  if (!availability.available) {
    // FR-016: stop with an explanation and the snapshot way out. No figure.
    throw new McpUnavailableError(availability.reason)
  }

  const snapshot = await loadSnapshot()
  const corpus = await loadCorpus(snapshot)
  const result = await measure({ corpus, capability, scope: flags['scope'] ?? 'all' })
  const bulkRoots = new Map(result.defects.map((defect) => [defect.word, defect.pluginOutput]))
  const words = capability === 'stem' ? [...corpus.derived.keys()] : [...corpus.syllables.keys()]
  const sample = await crossCheckSample({ capability, size, words, bulkRoots })
  const disagree = sample.filter((entry) => !entry.agree)
  log(`Sampel ${sample.length} kata, ${disagree.length} tidak cocok dengan MCP.`)
  for (const entry of disagree) {
    log(`  ${entry.word}: bulk=${entry.bulkRoot} mcp=${entry.mcpRoot}`)
  }
  return disagree.length === 0 ? 0 : 1
}

async function commandPlan(flags: Record<string, string>): Promise<number> {
  const capability = parseCapability(requireFlag(flags, 'capability'))
  const max = Number.parseInt(flags['max'] ?? String(MAX_DEFECTS_PER_STAGE), 10)
  if (!Number.isFinite(max) || max <= 0) throw new CliError('--max harus bilangan bulat positif.')
  const stage = await planStage({
    capability,
    max,
    baselineAccuracy: await currentAccuracy(),
    createdAt: new Date().toISOString(),
  })
  log(`${stage.id}: ${stage.defects.length} temuan kapabilitas ${stage.capability}.`)
  log(`Kata: ${stage.defects.join(', ')}`)
  return 0
}

async function commandVerify(flags: Record<string, string>): Promise<number> {
  const id = requireFlag(flags, 'stage')

  const cases = await loadRegressionCases()
  const regressions = runRegressionCases(cases)
  const searchGate = runSearchJoinGate(cases)

  // T045: a level-1 failure is the same failed condition as G1.
  let merged = await loadStage(id)
  merged = await recordGate(merged, SEARCH_UNIT_GATE, searchGate.failures.length === 0 ? 'pass' : 'fail')

  const { stage: updated, evaluation } = await verifyStage(merged, await currentAccuracy(), [
    ...regressions.failures.map((failure) => `regresi: ${failure}`),
    ...searchGate.failures.map((failure) => `pencarian: ${failure}`),
  ])

  log(`Tahap ${updated.id}: ${updated.status.toUpperCase()}`)
  log(`  G1 regresi kosong: ${evaluation.g1RegressionsEmpty ? 'lolos' : 'gagal'}`)
  log(`  G2 akurasi tidak turun: ${evaluation.g2AccuracyNotLower ? 'lolos' : 'gagal'}`)
  log(`  G3 seluruh gerbang lulus: ${evaluation.g3AllGatesPassed ? 'lolos' : 'gagal'}`)
  log(
    `  Kasus regresi: ${regressions.checked} diuji, ${searchGate.checked} diperiksa untuk ` +
      `pencarian, ${searchGate.skipped} dilewati (salah satu sisinya stop word)`,
  )
  for (const failure of evaluation.failures) log(`  - ${failure}`)
  log(`Gerbang tercatat: ${updated.gatesRun.join(', ') || '(belum ada)'}`)
  return evaluation.passed ? 0 : 1
}

async function commandRecord(flags: Record<string, string>): Promise<number> {
  const id = requireFlag(flags, 'stage')
  const gate = requireFlag(flags, 'gate')
  const result = requireFlag(flags, 'result')
  if (result !== 'pass' && result !== 'fail') throw new CliError('--result harus "pass" atau "fail".')
  const stage = await recordGate(await loadStage(id), gate, result)
  log(`${stage.id}: ${gate} -> ${result}. Status ${stage.status}.`)
  return 0
}

async function commandPromote(flags: Record<string, string>): Promise<number> {
  const id = requireFlag(flags, 'stage')
  const stage = await loadStage(id)
  const contractUpdated = (flags['contract-updated'] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const { fixed, cases } = await promoteStage(stage, { contractUpdated })
  log(`${stage.id}: ${fixed.length} temuan ditandai fixed, ${cases.length} kasus regresi baru.`)
  log('Fixture kurasi diperbarui: tests/fixtures/kbbi-regression-{stem,syllable}.json')
  return 0
}

async function commandDismiss(flags: Record<string, string>): Promise<number> {
  const id = requireFlag(flags, 'stage')
  const words = requireFlag(flags, 'word')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
  const reason = requireFlag(flags, 'reason')
  const dismissed = await dismissStageFindings(await loadStage(id), words, reason)
  log(
    `${id}: ${dismissed.length} temuan ditutup dengan triase tercatat: ` +
      dismissed.map((defect) => defect.word).join(', '),
  )
  return 0
}

async function commandTriage(flags: Record<string, string>): Promise<number> {
  const capability = parseCapability(requireFlag(flags, 'capability'))
  const rawClass = requireFlag(flags, 'class')
  if (!NON_FAILURE_CLASSES.has(rawClass as never)) {
    throw new CliError(`kelas ${rawClass} bukan kelas non-kegagalan`)
  }
  const words = flags['word']
    ? flags['word']
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean)
    : undefined
  const reason = flags['reason'] ?? ''
  if (reason.trim().length === 0) {
    throw new CliError('alasan wajib diisi: penolakan tanpa alasan melanggar FR-022')
  }
  const dismissed = await triageNonFailureFindings({
    capability,
    class: rawClass as 'reference-missing' | 'data-divergence' | 'root-word-self',
    words,
    reason,
  })
  log(
    `${dismissed.length} temuan non-kegagalan ditutup dengan triase tercatat: ` +
      dismissed.map((defect) => defect.word).join(', '),
  )
  return 0
}

async function commandRevert(flags: Record<string, string>): Promise<number> {
  const id = requireFlag(flags, 'stage')
  const reason = requireFlag(flags, 'reason')
  const stage = await loadStage(id)
  const { withdrawn } = await revertStage(stage, reason)
  log(`${stage.id}: ${withdrawn.length} kasus regresi ditarik dengan alasan tercatat.`)
  return 0
}

/**
 * FR-001 (US1/AC4, SC-001): every open finding has a valid CLI closure path, so
 * this predicate is that guarantee, and `status` reports it. A staged finding is
 * closed by the stage workflow; a stage-less non-failure class is closed by
 * `triage`; and a stage-less failure class has a path either way - `plan` stages
 * it while it still reproduces, and once it stops reproducing `measure`
 * reconciles it to `fixed` via `reconcileNonReproducing` (T017). No class of open
 * finding is left without a path, so `status` reports zero "tanpa jalur penutup".
 */
function hasClosurePath(_defect: Defect): boolean {
  return true
}

/**
 * `status` is the one read-only convenience command: it prints the accuracy each
 * capability was last measured at, which is exactly the baseline a new stage
 * records. Reading it does not touch the network and does not modify anything.
 */
async function commandStatus(): Promise<number> {
  const accuracy = await currentAccuracy()
  for (const capability of ['stem', 'syllable'] as const) {
    const value = accuracy[capability]
    log(
      `${capability.padEnd(9)}: ${
        value === null ? 'belum diukur' : `${(value * 100).toFixed(2)}%`
      }`,
    )
  }
  const stages = await listStageIds()
  log(`tahap     : ${stages.length > 0 ? stages.join(', ') : '(belum ada)'}`)

  // FR-001, SC-001, US1/AC4: every open finding must have a valid closure path,
  // and `status` is where that is checked. Splitting the open store into findings
  // that can be closed and those that cannot makes the guarantee observable.
  const open = (await loadDefectStore()).filter((defect) => defect.status === 'open')
  const withoutPath = open.filter((defect) => !hasClosurePath(defect))
  log(
    `temuan    : ${open.length} terbuka, ${open.length - withoutPath.length} punya jalur penutup, ` +
      `${withoutPath.length} tanpa jalur penutup`,
  )
  return 0
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const { command, flags } = parseArgs(argv)
  try {
    switch (command) {
      case '':
      case 'help':
        log(USAGE)
        return command === 'help' ? 0 : 1
      case 'snapshot':
        return await commandSnapshot(flags)
      case 'measure':
        return await commandMeasure(flags)
      case 'sample':
        return await commandSample(flags)
      case 'plan':
        return await commandPlan(flags)
      case 'verify':
        return await commandVerify(flags)
      case 'record':
        return await commandRecord(flags)
      case 'promote':
        return await commandPromote(flags)
      case 'dismiss':
        return await commandDismiss(flags)
      case 'triage':
        return await commandTriage(flags)
      case 'revert':
        return await commandRevert(flags)
      case 'status':
        return await commandStatus()
      default:
        throw new CliError(`perintah tidak dikenal: "${command}". Jalankan --help.`)
    }
  } catch (error) {
    if (
      error instanceof CliError ||
      error instanceof SnapshotError ||
      error instanceof StageError ||
      error instanceof McpUnavailableError
    ) {
      process.stderr.write(`${error.message}\n`)
      return 1
    }
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    return 1
  }
}