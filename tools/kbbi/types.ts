/**
 * Shared type declarations for the KBBI validation toolkit (FR-017).
 *
 * This file contains **declarations only** - no runtime code. It is derived
 * from `specs/002-validasi-kbbi-berbertahap/data-model.md` and is the single
 * vocabulary shared by `snapshot.ts`, `corpus.ts`, `compare.ts`, `report.ts`,
 * `stages.ts`, `mcp.ts` and `cli.ts`.
 *
 * It lives under `tools/`, never under `src/`: `tsup` only builds `src/`, so
 * nothing declared here can reach the published package (Prinsip III, FR-017).
 */

/** The two capabilities this feature measures. */
export type Capability = 'stem' | 'syllable'

/** Corpus stratum for the hyphenation capability (R5). */
export type Stratum = 'core' | 'loan'

/**
 * Closed defect taxonomy, evaluated in this exact order by `compare.ts` (R9).
 * The first rule that matches wins; there is no scoring and no retry.
 */
export type DefectClass =
  | 'reference-missing'
  | 'root-word-self'
  | 'plural-root'
  | 'affix-strip-missed'
  | 'over-stripped'
  | 'syllable-boundary-shift'
  | 'syllable-count-diff'
  | 'data-divergence'
  | 'candidate-bug'

/** A single file inside the pinned snapshot. */
export interface SnapshotFile {
  /** Repo-relative path inside `kbbi-harvester-cdn`, e.g. `lexicon/x.json`. */
  path: string
  /** 40 hex chars. Pins the tag to exact content (R2). */
  blobSha: string
  /** Size of the downloaded payload in bytes. */
  bytes: number
  /** 64 hex chars. Checksum of the content after download. */
  sha256: string
}

/** Counts of every entry kind the snapshot holds. `0` is valid when empty. */
export interface SnapshotEntryCount {
  derived: number
  rootWords: number
  syllables: number
}

/** The pinned dataset. Sole source of truth for every measurement (FR-012). */
export interface Snapshot {
  /** Snapshot format version. Currently `1`. */
  toolkitVersion: number
  /** Always `data-v4` for this feature version. */
  tag: string
  /** ISO-8601 UTC capture time. Metadata only - never an accuracy input. */
  capturedAt: string
  entryCount: SnapshotEntryCount
  files: SnapshotFile[]
}

/** One derived word, canonicalised (data-model §2). */
export interface CanonicalWord {
  /** Lowercase, no surrounding whitespace. Unique key. */
  word: string
  /** Non-empty root from the lexicon. Top entry with a mapping, file order. */
  referenceRoot: string
  /** From `derived_to_root_with_kelas.json`. May be empty. */
  kelasKata: string[]
}

/** One hyphenation entry, canonicalised (data-model §2). */
export interface CanonicalSyllable {
  /** Lowercase, no surrounding whitespace. Unique key. */
  word: string
  /** KBBI syllables, dot notation turned into hyphens. At least one element. */
  referenceSyllables: string[]
  /** Derived from the non-Indonesian onset list (R5). */
  stratum: Stratum
}

/** Why a word in scope was not counted in the accuracy denominator. */
export type ExclusionReason =
  /** Stratum `loan`: permanently outside the graduation gate (R5). */
  | 'stratum-loan'
  /** Compound word or reduplication: explicitly out of scope (spec Assumptions). */
  | 'compound-or-reduplication'
  /** Word is a legitimate root word with no derived mapping (FR-003 a). */
  | 'root-word-self'

/** Counters shared by every measurement and every breakdown bucket. */
export interface Counts {
  /** Words actually compared against a reference. */
  tested: number
  /** Of `tested`, the ones whose plugin output equals the reference. */
  matched: number
  /** Of `tested`, the ones that differ. Always `tested - matched`. */
  mismatched: number
}

/** `Counts` plus the two buckets that never enter the accuracy denominator. */
export interface MeasurementTotals extends Counts {
  /** Word not present in the relevant reference map. Never a failure. */
  referenceMissing: number
  /** Out-of-scope words (loan stratum, compound, root word). */
  excluded: number
}

/** A measurement result plus everything needed to reproduce it (FR-014). */
export interface Measurement {
  id: Capability
  /** Initial letter (`"m"`) or `"*"` for the whole corpus. */
  scope: string
  /** Copied from the snapshot. Mandatory in every report. */
  snapshotTag: string
  /** Blob SHAs of the snapshot files, abbreviated in the report head. */
  snapshotBlobShas: string[]
  /** Derived-word, root-word and hyphenation entry counts of the snapshot. */
  snapshotEntryCount: SnapshotEntryCount
  startedAt: string
  finishedAt: string
  totals: MeasurementTotals
  /** `matched / tested`, or `null` when `tested === 0` (FR-016). */
  accuracy: number | null
  /** Why each excluded word was excluded. */
  excludedBreakdown: Record<string, number>
  /** Word count in scope before any bucketing. */
  scopeWordCount: number
  byLetter: Record<string, Counts>
  byKelasKata: Record<string, Counts>
  /** Only populated for the `syllable` capability. */
  byStratum: Record<string, Counts>
  /** True when the run did not finish the whole scope (FR-015). */
  partial: boolean
  /** True when this run continued an interrupted one, so its totals are a
   * continuation rather than a standalone figure (FR-015). */
  resumed: boolean
  /** Words already completed by an earlier run and skipped here (FR-015). */
  skippedWords: number
  /** Words this run actually examined. */
  processedWords: number
  /** Last word completed, for resuming an interrupted run (FR-015). */
  lastWord: string | null
  /** Compact UTC stamp, e.g. `20261007T204500Z`. The report file name is
   * `<id>-<scope>-<runId>`; the durable defect store uses that full name as
   * `firstSeenRun`. */
  runId: string
}

/** One machine-readable finding (data-model §4). One JSONL line. */
export interface Defect {
  word: string
  capability: Capability
  pluginOutput: string
  referenceOutput: string
  class: DefectClass
  /** For `syllable`; always `null` for `stem`. */
  stratum: Stratum | null
  /** For `stem`; empty for `syllable`. */
  kelasKata: string[]
  source: 'snapshot' | 'mcp'
  /** Mandatory for `data-divergence`, `reference-missing`, `root-word-self`. */
  triageNote: string
  /** Fixing this would change a contract, golden fixture or override (FR-023). */
  contractLocked: boolean
  status: 'open' | 'fixed' | 'dismissed'
  stage: string | null
  firstSeenRun: string
  /** Reason a regression case was withdrawn, when applicable (FR-022). */
  withdrawnReason?: string
}

/** A permanently guarded case derived from a `fixed` defect (FR-009). */
export interface RegressionCase {
  word: string
  capability: Capability
  expected: string
  defectClass: DefectClass
  stage: string
  note: string
  /** Set when the case no longer applies; never silently deleted (FR-022). */
  withdrawn?: boolean
  withdrawnReason?: string
}

/** Status of a stage. `passed` requires G1, G2 **and** G3 (FR-010). */
export type StageStatus = 'in-progress' | 'passed' | 'failed'

/** One bounded batch of fixes, at most 20 findings, one capability (SC-003). */
export interface Stage {
  id: string
  createdAt: string
  capability: Capability
  defects: string[]
  baselineAccuracy: { stem: number | null; syllable: number | null }
  finalAccuracy: { stem: number | null; syllable: number | null }
  /** Regression cases that started failing again. G1 requires this empty. */
  regressions: string[]
  gatesRun: string[]
  status: StageStatus
  /** Result of each recorded gate, keyed the same way as `gatesRun`. */
  gateResults: Record<string, 'pass' | 'fail'>
}

/** Accuracy pair used by the G2 gate, which compares both capabilities. */
export type AccuracyPair = Stage['baselineAccuracy']

/** Result of evaluating G1-G3 for one stage. */
export interface GateEvaluation {
  g1RegressionsEmpty: boolean
  g2AccuracyNotLower: boolean
  g3AllGatesPassed: boolean
  passed: boolean
  /** Human-readable reasons, in gate order. */
  failures: string[]
}

/** Availability probe for the optional MCP adapter (R6, FR-016). */
export interface McpAvailability {
  available: boolean
  /** How the adapter was located, for the diagnostic message. */
  transport: 'stdio' | 'http' | 'none'
  /** Machine-readable cause when `available` is false. */
  reason: string
}

/** One cross-check of a bulk reading against the MCP tool (R6 role 1). */
export interface McpSample {
  word: string
  bulkRoot: string
  mcpRoot: string
  agree: boolean
}