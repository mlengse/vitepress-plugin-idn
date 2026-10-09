/**
 * Comparison and defect classification (T009, T013-T016, T022, T023, T031,
 * T036, FR-001 s.d. FR-005, FR-007, FR-016, R9).
 *
 * Two jobs live here, and they are deliberately not separable:
 *
 * - **Measurement**: run `stem()` or `syllabify()` over one snapshot scope and
 *   bucket every word into matched / mismatched / reference-missing / excluded.
 * - **Classification**: assign each mismatch exactly one class from the closed
 *   taxonomy, using ordered rules. The first rule that matches wins; there is
 *   no scoring, so FR-006's "recorded triage reason" is auditable rather than
 *   a matter of opinion.
 *
 * Nothing here is network-aware. The optional MCP adapter is a different module
 * (`mcp.ts`) that this file does not import, which is how R6's "bulk never calls
 * MCP" is enforced rather than merely intended.
 */

import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  canonicalPluginHyphenation,
  canonicalWord,
  isCompoundOrReduplication,
  loadCorpus,
  type Corpus,
} from './corpus.ts'
import { GOLDEN_FIXTURE, OPEN_DEFECTS_PATH, REPO_ROOT } from './paths.ts'
import { stem } from '../../src/core/stem.ts'
import { syllabify } from '../../src/core/syllabify.ts'
import type {
  Capability,
  Counts,
  Defect,
  DefectClass,
  Measurement,
  MeasurementTotals,
  Stratum,
} from './types.ts'

export type { Defect }

/** Prefixes whose presence in the plugin output means the affix survived. */
export const AFFIX_PREFIXES: readonly string[] = [
  'meng',
  'meny',
  'mem',
  'men',
  'peng',
  'peny',
  'pem',
  'pen',
  'ber',
  'per',
  'ter',
  'di',
  'ke',
  'se',
  'me',
  'pe',
  'be',
  'te',
]

/** Suffixes whose presence in the plugin output means the affix survived. */
export const AFFIX_SUFFIXES: readonly string[] = [
  'kannya',
  'nya',
  'lah',
  'kah',
  'pun',
  'kan',
  'an',
  'al',
  'ya',
  'ku',
  'mu',
  'i',
]

/**
 * Plural / possessive suffixes. Narrow on purpose: a broad `-an` or `-i` rule
 * would swallow ordinary derivational morphology and mislabel it as a plural
 * defect (defect-taxonomy, rule 3).
 */
export const PLURAL_SUFFIXES: readonly string[] = ['nya', 'lah', 'kah', 'pun', 'ku', 'mu']

/** Everything classification needs about one word. */
export interface DefectContext {
  word: string
  capability: Capability
  pluginOutput: string
  referenceOutput: string
  /** The reference map for this capability has an entry for the word. */
  referencePresent: boolean
  /** Word is listed in `root_words.txt`. */
  isRootWord: boolean
  /** Word carries a root mapping in the derived lexicon. */
  hasDerivedMapping: boolean
  /** Hyphenation stratum; `null` when the hyphenation dictionary lacks it. */
  stratum: Stratum | null
  /** Reference syllables, used to distinguish boundary shift from count diff. */
  referenceSyllables: string[]
}

/** A data anomaly: the lexicon entry is not a plain Indonesian word form. */
export function isDataAnomaly(word: string): boolean {
  if (/\s/u.test(word)) return true
  return !/^[\p{L}-]+$/u.test(word)
}

function hasSurvivingPrefix(pluginOutput: string): boolean {
  return AFFIX_PREFIXES.some(
    (prefix) => pluginOutput.length > prefix.length && pluginOutput.startsWith(prefix),
  )
}

function hasSurvivingSuffix(pluginOutput: string): boolean {
  return AFFIX_SUFFIXES.some(
    (suffix) => pluginOutput.length > suffix.length && pluginOutput.endsWith(suffix),
  )
}

/**
 * Ordered classification (R9). The order is the specification, not an
 * implementation detail: putting `syllable-boundary-shift` after
 * `candidate-bug` would let every boundary shift vanish into the generic class,
 * which `contracts/defect-taxonomy.md` calls out as a forbidden anti-pattern.
 */
export function classifyDefect(context: DefectContext): DefectClass {
  // 1. No reference for this capability at all. Never a failure.
  if (!context.referencePresent) return 'reference-missing'

  // 2. A legitimate root word with no derived mapping. Counted as a match.
  //    Root membership is a stemming concept; applying it to the hyphenation
  //    capability would exclude thousands of perfectly comparable words simply
  //    for being base words.
  if (context.capability === 'stem' && !context.hasDerivedMapping && context.isRootWord) {
    return 'root-word-self'
  }

  const plugin = context.pluginOutput
  const reference = context.referenceOutput

  // Loan-stratum words are out of scope entirely (R5, T023), so they resolve
  // here - before the syllable classes - rather than being classified as an
  // ordinary difference. The measurement already excludes them, so this branch
  // is the backstop that makes the rule hold for any caller.
  if (context.stratum === 'loan') return 'data-divergence'

  if (context.capability === 'syllable') {
    const pluginSyllables = plugin.length > 0 ? plugin.split('-') : []
    // 6 then 7: same count is a boundary shift, different count is a count
    // diff. Checked before the generic classes, by contract.
    if (pluginSyllables.length === context.referenceSyllables.length) return 'syllable-boundary-shift'
    return 'syllable-count-diff'
  }

  // 3. Plural/possessive left partly unstripped: the reference is exactly the
  // word minus a plural suffix, and the plugin root is a prefix of it.
  const plural = PLURAL_SUFFIXES.find(
    (suffix) =>
      context.word.endsWith(suffix) &&
      context.word.slice(0, -suffix.length) === reference &&
      plugin.length < reference.length &&
      reference.startsWith(plugin),
  )
  if (plural) return 'plural-root'

  // 4. An affix is still attached to the plugin output.
  if (hasSurvivingPrefix(plugin) || hasSurvivingSuffix(plugin)) return 'affix-strip-missed'

  // 5. The plugin cut into the middle of the reference root.
  if (plugin.length < reference.length && reference.startsWith(plugin)) return 'over-stripped'

  // 8 before 9: outside the core corpus, an unexplained difference is far more
  // likely to be a reference artefact than a plugin bug.
  return 'candidate-bug'
}

/** Classes that count as failures and may therefore enter a fix stage (FR-010). */
export const FAILURE_CLASSES: ReadonlySet<DefectClass> = new Set<DefectClass>([
  'plural-root',
  'affix-strip-missed',
  'over-stripped',
  'syllable-boundary-shift',
  'syllable-count-diff',
  'candidate-bug',
])

/**
 * Classes that never count as failures and can never enter a fix stage.
 * These are closed via triage (dismiss with reason), not via code fixes.
 */
export const NON_FAILURE_CLASSES: ReadonlySet<DefectClass> = new Set<DefectClass>([
  'reference-missing',
  'data-divergence',
  'root-word-self',
])

export function countsFailure(defectClass: DefectClass): boolean {
  return FAILURE_CLASSES.has(defectClass)
}

/**
 * Triage notes.
 *
 * Three classes *require* one (FR-006): `data-divergence`, `reference-missing`
 * and `root-word-self` - for those the note is the only thing explaining why the
 * finding is not a failure. The other classes take a note too, because the note
 * is where the mechanism goes, and a bare `candidate-bug` row tells a reviewer
 * nothing about what to do next. Every note below states a cause, never an
 * excuse.
 */
const CLASS_NOTES: Readonly<Record<DefectClass, string>> = {
  'reference-missing':
    'Kata tidak ditemukan pada peta referensi kapabilitas ini; bukan kegagalan plugin.',
  'root-word-self':
    'Kata dasar sah: ada di root_words.txt tanpa pemetaan turunan, jadi bukan kegagalan.',
  'plural-root':
    'Imbuhan jamak atau possessif belum dilepas seluruhnya; akar plugin awalan akar referensi.',
  'affix-strip-missed':
    'Imbuhan masih melekat pada hasil plugin: awalan atau sufiks ada di keluaran tetapi tidak ada di akar referensi.',
  'over-stripped':
    'Plugin memotong di dalam akar referensi: keluaran lebih pendek dan merupakan awalan dari akar.',
  'syllable-boundary-shift':
    'Jumlah suku kata sama, batasnya berbeda; ini pergeseran batas, bukan jumlah suku kata.',
  'syllable-count-diff':
    'Jumlah suku kata plugin dan KBBI berbeda.',
  'data-divergence':
    'Di luar korpus inti (stratum serapan atau entri data anomali); selisih dijelaskan sebagai masalah referensi, bukan plugin.',
  'candidate-bug':
    'Tidak cocok aturan pola mana pun dan kata berada di dalam korpus inti; kandidat cacat plugin.',
}

/** Mandatory triage notes for the three classes that require one (FR-006). */
export function defaultTriageNote(defectClass: DefectClass): string {
  return CLASS_NOTES[defectClass] ?? ''
}

// --- contract lock detection (T031, FR-023) ---------------------------------

interface LockedVocabulary {
  contractExamples: Set<string>
  goldenStem: Set<string>
  goldenSyllable: Set<string>
  overrides: Set<string>
}

let cachedVocabulary: LockedVocabulary | null = null

function readPairs(path: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (pair): pair is [string, string] =>
          Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string',
      )
    }
  } catch {
    /* a missing or unreadable fixture simply contributes no locked words */
  }
  return []
}

/**
 * Words whose output is pinned by a published contract, a golden fixture, or
 * the hardcoded override table. Fixing a finding that would move any of these
 * is `contract-locked`: not blocked, but obliging the same change to update the
 * contract, its test, and the Clarifications section (FR-023, SC-013).
 */
export async function loadLockedVocabulary(): Promise<LockedVocabulary> {
  if (cachedVocabulary) return cachedVocabulary

  const contractExamples = new Set<string>()
  try {
    const contract = await readFile(
      `${REPO_ROOT}/specs/001-indonesian-search-plugin/contracts/public-api.md`,
      'utf8',
    )
    // Inline-code spans in the example tables name words; harvest them all so a
    // contract example added later is picked up without touching this module.
    for (const match of contract.matchAll(/`([^`\n]+)`/g)) {
      const token = (match[1] ?? '').trim().toLowerCase()
      if (token.length > 0 && /^[\p{L}\s-]+$/u.test(token)) contractExamples.add(token)
    }
  } catch {
    /* contract absent: nothing is locked by it */
  }

  const goldenStem = new Set(readPairs(GOLDEN_FIXTURE.stem).map(([word]) => word.toLowerCase()))
  const goldenSyllable = new Set(
    readPairs(GOLDEN_FIXTURE.syllable).map(([word]) => word.toLowerCase()),
  )

  let overrides: Set<string> = new Set()
  try {
    const source = await readFile(`${REPO_ROOT}/src/core/syllabify.ts`, 'utf8')
    const block = /const OVERRIDES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(source)
    if (block?.[1]) {
      overrides = new Set(
        [...block[1].matchAll(/^\s{2}([A-Za-z-]+):/gm)].map((m) => (m[1] ?? '').toLowerCase()),
      )
    }
  } catch {
    /* source absent: nothing is locked by the override table */
  }

  cachedVocabulary = { contractExamples, goldenStem, goldenSyllable, overrides }
  return cachedVocabulary
}

function pinsOutput(
  vocabulary: LockedVocabulary,
  capability: Capability,
  tokens: readonly string[],
): { source: string } | null {
  for (const token of tokens) {
    const value = token.toLowerCase()
    if (value.length === 0) continue
    const hyphenated = value.includes('-')
    if (capability === 'stem') {
      // A stem fix can only move a plain-word promise: the stem golden list and
      // the plain-word examples in the contract table.
      if (hyphenated) continue
      if (vocabulary.goldenStem.has(value)) return { source: 'tests/fixtures/stem-golden.json' }
      if (vocabulary.contractExamples.has(value)) return { source: 'contracts/public-api.md' }
    } else {
      if (vocabulary.goldenSyllable.has(value)) {
        return { source: 'tests/fixtures/syllabify-golden.json' }
      }
      if (vocabulary.overrides.has(value)) return { source: 'src/core/syllabify.ts OVERRIDES' }
      if (hyphenated && vocabulary.contractExamples.has(value)) {
        return { source: 'contracts/public-api.md' }
      }
    }
  }
  return null
}

/**
 * `contractLocked` is decided on the word, the current output and the proposed
 * output, and scoped to the capability being measured.
 *
 * The scoping matters: `abangan` appears in `syllabify-golden.json` because it
 * is a word someone chose to hyphenate, but fixing `stem('abangan')` cannot
 * change `syllabify('abangan')`. Locking across capabilities would mark hundreds
 * of stemming fixes as contract-breaking and drown the real ones.
 */
export async function detectContractLock(
  capability: Capability,
  word: string,
  pluginOutput: string,
  referenceOutput: string,
): Promise<{ contractLocked: boolean; source: string }> {
  const vocabulary = await loadLockedVocabulary()
  const pinned = pinsOutput(vocabulary, capability, [word, pluginOutput, referenceOutput])
  return pinned ? { contractLocked: true, source: pinned.source } : { contractLocked: false, source: '' }
}

// --- defect store (FR-005, idempotency) -------------------------------------

/** Idempotency key: a word seen again with a different reference is a new finding. */
export function defectKey(defect: Pick<Defect, 'capability' | 'word' | 'referenceOutput'>): string {
  return `${defect.capability}\u0000${defect.word}\u0000${defect.referenceOutput}`
}

export async function loadDefectStore(path: string = OPEN_DEFECTS_PATH): Promise<Defect[]> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return []
  }
  const defects: Defect[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      defects.push(JSON.parse(trimmed) as Defect)
    } catch {
      /* a truncated last line from an interrupted run is dropped, not fatal */
    }
  }
  return defects
}

export async function writeDefectStore(
  defects: readonly Defect[],
  path: string = OPEN_DEFECTS_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const body = defects.map((defect) => JSON.stringify(defect)).join('\n')
  await writeFile(path, defects.length > 0 ? `${body}\n` : '', 'utf8')
}

/**
 * Merge a run's findings into the store without duplicating existing keys
 * (FR-005). Status and stage already recorded are preserved: a re-measurement
 * must never reopen a fixed finding or detach it from its stage.
 */
export function mergeDefects(
  store: readonly Defect[],
  incoming: readonly Defect[],
): { merged: Defect[]; added: number } {
  const byKey = new Map<string, Defect>()
  const order: string[] = []
  for (const defect of store) {
    const key = defectKey(defect)
    if (!byKey.has(key)) order.push(key)
    byKey.set(key, defect)
  }
  let added = 0
  for (const defect of incoming) {
    const key = defectKey(defect)
    const existing = byKey.get(key)
    if (!existing) {
      order.push(key)
      byKey.set(key, defect)
      added++
      continue
    }
    byKey.set(key, {
      ...defect,
      status: existing.status,
      stage: existing.stage,
      firstSeenRun: existing.firstSeenRun,
      ...(existing.withdrawnReason ? { withdrawnReason: existing.withdrawnReason } : {}),
    })
  }
  const merged = order.map((key) => byKey.get(key) as Defect)
  merged.sort((a, b) =>
    a.capability === b.capability
      ? a.word === b.word
        ? a.referenceOutput.localeCompare(b.referenceOutput)
        : a.word.localeCompare(b.word)
      : a.capability.localeCompare(b.capability),
  )
  return { merged, added }
}

// --- measurement -------------------------------------------------------------

const ZERO_COUNTS: Counts = { tested: 0, matched: 0, mismatched: 0 }

function bump(bucket: Record<string, Counts>, key: string, matched: boolean): void {
  const current = bucket[key] ?? { ...ZERO_COUNTS }
  current.tested += 1
  if (matched) current.matched += 1
  else current.mismatched += 1
  bucket[key] = current
}

function bumpValue(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1
}

/** Fixed key order for the JSONL defect lines (report-format rule 2). */
export function serializeDefect(defect: Defect, firstSeenRun: string | null): string {
  const ordered = {
    word: defect.word,
    capability: defect.capability,
    pluginOutput: defect.pluginOutput,
    referenceOutput: defect.referenceOutput,
    class: defect.class,
    stratum: defect.stratum ?? null,
    kelasKata: defect.kelasKata,
    source: defect.source,
    triageNote: defect.triageNote,
    status: defect.status,
    stage: defect.stage ?? null,
    contractLocked: defect.contractLocked,
    firstSeenRun,
  }
  return JSON.stringify(ordered)
}

export interface MeasureOptions {
  corpus: Corpus
  capability: Capability
  /** Initial letter, or `*`/`all` for the whole corpus. */
  scope: string
  /** Injectable clock; the measurement result never depends on wall time. */
  now?: () => Date
  /** Resume after this word (FR-015). */
  resumeAfter?: string | null
  /** Called after each word, so an interrupted run can checkpoint. */
  onProgress?: (lastWord: string) => void
}

export interface MeasureResult {
  measurement: Measurement
  defects: Defect[]
  /** Words that matched the resumed position but were skipped this run. */
  resumed: boolean
}

/**
 * Measure one capability over one scope.
 *
 * Word selection differs by capability on purpose:
 *
 * - `stem` walks the derived lexicon, because SC-001 is defined over "the whole
 *   derived-word lexicon that has a root mapping".
 * - `syllable` walks the *union* of the derived lexicon and the hyphenation
 *   dictionary, so a word the hyphenation dictionary never covers surfaces as
 *   `reference-missing` (FR-003 b) instead of quietly not existing.
 */
export async function measure(options: MeasureOptions): Promise<MeasureResult> {
  const { corpus, capability } = options
  const scope = options.scope === 'all' || options.scope === '*' ? '*' : options.scope.toLowerCase()
  const now = options.now ?? (() => new Date())
  const startedAt = now()

  const source =
    capability === 'stem'
      ? [...corpus.derived.keys(), ...corpus.withoutRoot.keys()]
      : [...corpus.syllables.keys(), ...corpus.derived.keys()]

  const scopeWords = [...new Set(source)]
    .filter((word) => (scope === '*' ? true : word.startsWith(scope)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const resumeAfter = options.resumeAfter ?? null
  const words = resumeAfter
    ? scopeWords.filter((word) => word > resumeAfter)
    : scopeWords

  const totals: MeasurementTotals = {
    tested: 0,
    matched: 0,
    mismatched: 0,
    referenceMissing: 0,
    excluded: 0,
  }
  const excludedBreakdown: Record<string, number> = {}
  const byLetter: Record<string, Counts> = {}
  const byKelasKata: Record<string, Counts> = {}
  const byStratum: Record<string, Counts> = {}
  const defects: Defect[] = []
  const lockedCache = await loadLockedVocabulary()

  let partial = false
  let lastWord: string | null = null

  try {
    for (const word of words) {
      lastWord = word
      const letter = word.slice(0, 1)
      const syllableEntry = corpus.syllables.get(word)
      const stratum: Stratum | null = syllableEntry?.stratum ?? null
      const derivedEntry = corpus.derived.get(word)

      // --- out of scope, before anything else ---------------------------
      if (isCompoundOrReduplication(word) || isDataAnomaly(word)) {
        totals.excluded += 1
        bumpValue(excludedBreakdown, 'compound-or-reduplication')
        options.onProgress?.(word)
        continue
      }

      // Loan-stratum words are permanently outside the graduation gate (R5,
      // T023). They are still measured - a real number, not a placeholder - and
      // reported under `byStratum.loan` for transparency, but they never become
      // findings and never enter the accuracy denominator.
      const pluginRaw = capability === 'stem' ? stem(word) : syllabify(word)
      const pluginOutput =
        capability === 'stem' ? canonicalWord(pluginRaw) : canonicalPluginHyphenation(pluginRaw)

      if (stratum === 'loan') {
        totals.excluded += 1
        bumpValue(excludedBreakdown, 'stratum-loan')
        const referenceText = syllableEntry?.referenceSyllables.join('-') ?? ''
        const loanBucket = byStratum.loan ?? { ...ZERO_COUNTS }
        byStratum.loan = loanBucket
        bump({ loan: loanBucket }, 'loan', pluginOutput === referenceText)
        options.onProgress?.(word)
        continue
      }

      const referencePresent =
        capability === 'stem'
          ? derivedEntry !== undefined || corpus.withoutRoot.has(word)
          : syllableEntry !== undefined
      const isRootWord = corpus.rootWords.has(word)
      const hasDerivedMapping = derivedEntry !== undefined

      const referenceOutput =
        capability === 'stem'
          ? (derivedEntry?.referenceRoot ?? '')
          : (syllableEntry?.referenceSyllables.join('-') ?? '')
      const referenceSyllables = syllableEntry?.referenceSyllables ?? []

      if (!referencePresent || referenceOutput.length === 0) {
        totals.referenceMissing += 1
        defects.push({
          word,
          capability,
          pluginOutput,
          referenceOutput,
          class: 'reference-missing',
          stratum: capability === 'syllable' ? (stratum ?? null) : null,
          kelasKata: capability === 'stem' ? (derivedEntry?.kelasKata ?? []) : [],
          source: 'snapshot',
          triageNote: defaultTriageNote('reference-missing'),
          contractLocked: false,
          status: 'open',
          stage: null,
          firstSeenRun: '',
        })
        options.onProgress?.(word)
        continue
      }

      // A legitimate root word with no derived mapping is a match by rule, not
      // a comparison (FR-003 a). It stays out of `tested`, which keeps the
      // data-model invariant `tested + referenceMissing + excluded` intact.
      const defectClass = classifyDefect({
        word,
        capability,
        pluginOutput,
        referenceOutput,
        referencePresent: true,
        isRootWord,
        hasDerivedMapping,
        stratum,
        referenceSyllables,
      })
      if (defectClass === 'root-word-self') {
        totals.excluded += 1
        bumpValue(excludedBreakdown, 'root-word-self')
        options.onProgress?.(word)
        continue
      }

      const matched = pluginOutput === referenceOutput
      totals.tested += 1
      bump(byLetter, letter, matched)
      for (const kelas of capability === 'stem' ? (derivedEntry?.kelasKata ?? []) : []) {
        bump(byKelasKata, kelas, matched)
      }
      if (stratum) {
        const bucket = byStratum[stratum] ?? { ...ZERO_COUNTS }
        bucket.tested += 1
        if (matched) bucket.matched += 1
        else bucket.mismatched += 1
        byStratum[stratum] = bucket
      }
      if (matched) {
        totals.matched += 1
        options.onProgress?.(word)
        continue
      }
      totals.mismatched += 1

      const lock = pinsOutput(lockedCache, capability, [word, pluginOutput, referenceOutput])
      const triageNote = lock
        ? `Perbaikan mengubah hasil yang tertuang pada ${lock.source}: ` +
          `nilai lama ${pluginOutput || '(kosong)'}, nilai baru ${referenceOutput}. ` +
          `KBBI diperlakukan sebagai otoritas terakhir atas kebenaran linguistik, ` +
          `jadi kontrak, fixture, dan test wajib diselaraskan pada perubahan yang sama.`
        : defaultTriageNote(defectClass)

      defects.push({
        word,
        capability,
        pluginOutput,
        referenceOutput,
        class: defectClass,
        stratum: capability === 'syllable' ? (stratum ?? null) : null,
        kelasKata: capability === 'stem' ? (derivedEntry?.kelasKata ?? []) : [],
        source: 'snapshot',
        triageNote,
        contractLocked: lock !== null,
        status: 'open',
        stage: null,
        firstSeenRun: '',
      })
      options.onProgress?.(word)
    }
  } catch (error) {
    // FR-015: an interrupted measurement reports what it finished and nothing
    // more. Words that never ran cannot appear as failures.
    partial = true
    void error
  }

  const finishedAt = now()
  const runStamp = formatRunStamp(startedAt)
  const runId = runStamp
  const runName = `${capability}-${scope === '*' ? 'all' : scope}-${runStamp}`

  const measurement: Measurement = {
    id: capability,
    scope: scope === '*' ? 'all' : scope,
    snapshotTag: corpus.snapshot.tag,
    snapshotBlobShas: corpus.snapshot.files.map((file) => file.blobSha),
    snapshotEntryCount: corpus.snapshot.entryCount,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totals,
    accuracy: totals.tested > 0 ? totals.matched / totals.tested : null,
    excludedBreakdown,
    scopeWordCount: scopeWords.length,
    byLetter,
    byKelasKata,
    byStratum,
    partial,
    resumed: resumeAfter !== null,
    skippedWords: scopeWords.length - words.length,
    processedWords: words.length,
    lastWord,
    runId,
  }

  defects.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
  for (const defect of defects) defect.firstSeenRun = runName
  return { measurement, defects, resumed: resumeAfter !== null }
}

/** `20261007T204500Z`. Only the run id carries a timestamp; numbers never do. */
export function formatRunStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Invariant from `data-model.md` §3: every word a run examines lands in exactly
 * one of the three non-tested buckets, or in `tested`. A violation is a toolkit
 * bug, not a data problem, so it throws.
 *
 * The sum is checked against `processedWords`, not `scopeWordCount`: a run that
 * resumed after an interruption legitimately covers only the remainder, and
 * counting the words an earlier run already did would report a false violation
 * on exactly the runs FR-015 exists to support. The second check then proves the
 * two numbers still add up to the whole scope.
 */
export function assertScopeAccounting(measurement: Measurement): void {
  const { totals } = measurement
  const sum = totals.tested + totals.referenceMissing + totals.excluded
  if (sum !== measurement.processedWords) {
    throw new Error(
      ` Accounting gagal: tested(${totals.tested}) + referenceMissing(${totals.referenceMissing})` +
        ` + excluded(${totals.excluded}) = ${sum}, sedangkan run ini memeriksa ` +
        `${measurement.processedWords} kata.`,
    )
  }
  if (measurement.processedWords + measurement.skippedWords !== measurement.scopeWordCount) {
    throw new Error(
      ` Accounting gagal: diproses(${measurement.processedWords}) + dilewati(${measurement.skippedWords}) ` +
        `!= cakupan(${measurement.scopeWordCount}).`,
    )
  }
  if (totals.matched + totals.mismatched !== totals.tested) {
    throw new Error(
      `Accounting gagal: matched(${totals.matched}) + mismatched(${totals.mismatched}) ` +
        `!= tested(${totals.tested}).`,
    )
  }
}

/** Convenience wrapper used by the CLI. */
export async function measureFromSnapshot(
  corpus: Corpus,
  capability: Capability,
  scope: string,
  options: Omit<MeasureOptions, 'corpus' | 'capability' | 'scope'> = {},
): Promise<MeasureResult> {
  return measure({ ...options, corpus, capability, scope })
}

export { loadCorpus }