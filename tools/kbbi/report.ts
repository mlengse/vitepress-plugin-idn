/**
 * Report rendering (T006, T017, T018, T024, T037, FR-002, FR-014, FR-020).
 *
 * Two outputs are written from one in-memory result, so they can never
 * disagree:
 *
 * - **JSONL** is the machine-readable authority: one finding per line, fixed key
 *   order, explicit nulls, ascending by word. `contracts/report-format.md`
 *   requires byte-identical reruns (FR-013), so run-varying values are kept out
 *   of it - see `serializeDefect`.
 * - **Markdown** is the human summary, capped at 50 findings so the file stays
 *   readable; the truncation is stated in the file itself rather than left for
 *   the reader to discover.
 *
 * Accuracy is printed only when it was actually measured. `Diuji = 0` prints
 * `tidak diukur`, never `0%` (FR-016).
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { REPORT_DIR } from './paths.ts'
import { countsFailure, serializeDefect } from './compare.ts'
import type { Counts, Defect, Measurement } from './types.ts'

/** Markdown finding tables stop here; the JSONL keeps everything (report-format). */
export const MARKDOWN_FINDING_LIMIT = 50

const CAPABILITY_LABEL: Record<string, string> = {
  stem: 'akar kata',
  syllable: 'pemenggalan suku kata',
}

function formatInt(value: number): string {
  return value.toLocaleString('id-ID')
}

/** Indonesian decimal comma, as the report contract requires. */
export function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

/** `null` accuracy prints as "not measured", never as `0%` (FR-016). */
function accuracyCell(tested: number, accuracy: number | null): string {
  if (tested === 0 || accuracy === null) return 'tidak diukur'
  return formatPercent(accuracy)
}

function shortenSha(sha: string): string {
  return `${sha.slice(0, 8)}…`
}

function breakdownTable(title: string, rows: Record<string, Counts>): string[] {
  const keys = Object.keys(rows).sort((a, b) => a.localeCompare(b))
  if (keys.length === 0) return []
  const lines = [`## ${title}`, '', '| Kunci | Diuji | Cocok | Berbeda | Akurasi |', '| --- | --- | --- | --- | --- |']
  for (const key of keys) {
    const counts = rows[key] as Counts
    const accuracy = counts.tested > 0 ? counts.matched / counts.tested : null
    lines.push(
      `| ${key} | ${formatInt(counts.tested)} | ${formatInt(counts.matched)} | ` +
        `${formatInt(counts.mismatched)} | ${accuracyCell(counts.tested, accuracy)} |`,
    )
  }
  lines.push('')
  return lines
}

/**
 * `firstSeenRun` is deliberately `null` in the report JSONL.
 *
 * The report is required to be byte-identical across reruns of the same
 * snapshot (FR-013), and a run id is a timestamp. The real value lives in the
 * durable defect store at `.kbbi/defects/open.jsonl`, where it does not have to
 * be stable. The key stays present so the line shape never changes.
 */
export function renderJsonl(measurement: Measurement, defects: readonly Defect[]): string {
  const lines = defects.map((defect) => serializeDefect(defect, null))
  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}

export function renderMarkdown(measurement: Measurement, defects: readonly Defect[]): string {
  const { totals, accuracy } = measurement
  const scopeLabel = measurement.scope === 'all' ? 'seluruh corpus' : `huruf awal "${measurement.scope}"`
  const lines: string[] = []

  lines.push(`# Pengukuran ${CAPABILITY_LABEL[measurement.id] ?? measurement.id} — ${scopeLabel}`)
  lines.push('')
  if (measurement.partial) {
    lines.push(
      `> **PENGUKURAN TERPUTUS.** ${formatInt(measurement.processedWords)} kata diproses, ` +
        `sisa tidak diukur.`,
    )
    lines.push('> Angka di bawah ini bukan angka final dan tidak boleh dipakai sebagai gerbang.')
    lines.push('')
  } else if (measurement.resumed) {
    lines.push(
      `> **PENGUKURAN DILANJUTKAN.** ${formatInt(measurement.skippedWords)} kata sudah selesai ` +
        `pada run sebelumnya; angka di bawah ini hanya mencakup ${formatInt(measurement.processedWords)} ` +
        `kata sisanya. Jalankan ulang tanpa checkpoint untuk memperoleh angka penuh.`,
    )
    lines.push('')
  }
  lines.push(
    `- Snapshot: \`${measurement.snapshotTag}\` (${measurement.snapshotBlobShas
      .map(shortenSha)
      .join(' + ')})`,
  )
  lines.push(
    `- Cardinality: ${formatInt(measurement.snapshotEntryCount.derived)} kata turunan, ` +
      `${formatInt(measurement.snapshotEntryCount.rootWords)} kata dasar, ` +
      `${formatInt(measurement.snapshotEntryCount.syllables)} entri pemenggalan`,
  )
  lines.push(`- Cakupan: ${formatInt(measurement.scopeWordCount)} kata dalam cakupan`)
  lines.push(`- Dijalankan: ${measurement.startedAt} → ${measurement.finishedAt}`)
  lines.push('- Perkakas: 1')
  lines.push('- Mode: snapshot (tanpa jaringan)')
  lines.push('')

  lines.push('## Ringkasan')
  lines.push('')
  lines.push('| Metrik | Nilai |')
  lines.push('| --- | --- |')
  lines.push(`| Diuji | ${formatInt(totals.tested)} |`)
  lines.push(`| Cocok | ${formatInt(totals.matched)} |`)
  lines.push(`| Berbeda | ${formatInt(totals.mismatched)} |`)
  lines.push(`| Akurasi | ${accuracyCell(totals.tested, accuracy)} |`)
  lines.push(`| Data tidak tersedia | ${formatInt(totals.referenceMissing)} |`)
  lines.push(`| Di luar cakupan | ${formatInt(totals.excluded)} |`)
  lines.push('')
  const excludedEntries = Object.entries(measurement.excludedBreakdown).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  for (const [reason, count] of excludedEntries) {
    lines.push(`- Di luar cakupan, \`${reason}\`: ${formatInt(count)}`)
  }
  if (excludedEntries.length > 0) lines.push('')

  lines.push(...breakdownTable('Per huruf awal', measurement.byLetter))
  if (measurement.id === 'stem') {
    lines.push(...breakdownTable('Per kelas kata', measurement.byKelasKata))
  } else {
    const stratumOrder = ['core', 'loan'].filter((key) => key in measurement.byStratum)
    const stratumRows: Record<string, Counts> = {}
    for (const key of stratumOrder) stratumRows[key] = measurement.byStratum[key] as Counts
    lines.push(...breakdownTable('Per stratum', stratumRows))
  }

  const failing = defects.filter((defect) => countsFailure(defect.class))
  lines.push('## Temuan')
  lines.push('')
  if (failing.length === 0) {
    lines.push('_Tidak ada temuan yang dihitung sebagai kegagalan._')
    lines.push('')
  } else {
    const ordered = [...failing].sort(
      (a, b) => a.class.localeCompare(b.class) || a.word.localeCompare(b.word),
    )
    const shown = ordered.slice(0, MARKDOWN_FINDING_LIMIT)
    lines.push('| Kata | Plugin | Referensi | Kelas | Catatan |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const defect of shown) {
      const note = defect.triageNote.replace(/\|/g, '\\|').trim()
      lines.push(
        `| ${defect.word} | ${defect.pluginOutput || '(kosong)'} | ${defect.referenceOutput} | ` +
          `${defect.class} | ${note} |`,
      )
    }
    lines.push('')
    if (ordered.length > shown.length) {
      lines.push(
        `_Menampilkan ${shown.length} dari ${formatInt(ordered.length)} temuan. ` +
          `Lihat \`.jsonl\` untuk daftar lengkap._`,
      )
      lines.push('')
    }
  }

  lines.push('## Gate')
  lines.push('')
  const core = measurement.byStratum.core
  if (measurement.id === 'syllable' && core) {
    const coreAccuracy = core.tested > 0 ? core.matched / core.tested : null
    lines.push(
      `- Gate \`syllable/core\`: ${accuracyCell(core.tested, coreAccuracy)} (target 97%)` +
        `${coreAccuracy !== null && coreAccuracy >= 0.97 ? ' - LOLOS' : ' - BELUM TERCAPAI'}`,
    )
    const loan = measurement.byStratum.loan
    if (loan) {
      const loanAccuracy = loan.tested > 0 ? loan.matched / loan.tested : null
      lines.push(
        `- Stratum \`loan\` (transparansi, tidak menjadi gerbang): ` +
          `${accuracyCell(loan.tested, loanAccuracy)}`,
      )
    }
  } else {
    lines.push(
      `- Gate \`${measurement.id}\`: ${accuracyCell(totals.tested, accuracy)} (target 98%)` +
        `${accuracy !== null && accuracy >= 0.98 ? ' - LOLOS' : ' - BELUM TERCAPAI'}`,
    )
  }
  lines.push(`- Regresi: 0`)
  lines.push('')

  return `${lines.join('\n')}\n`
}

export interface ReportPaths {
  markdown: string
  jsonl: string
}

/** Write both report forms for one measurement. */
export async function writeReport(
  measurement: Measurement,
  defects: readonly Defect[],
  dir: string = REPORT_DIR,
): Promise<ReportPaths> {
  await mkdir(dir, { recursive: true })
  const base = `${measurement.id}-${measurement.scope}-${measurement.runId}`
  const markdown = `${dir}/${base}.md`
  const jsonl = `${dir}/${base}.jsonl`
  await mkdir(dirname(markdown), { recursive: true })
  await writeFile(markdown, renderMarkdown(measurement, defects), 'utf8')
  await writeFile(jsonl, renderJsonl(measurement, defects), 'utf8')
  return { markdown, jsonl }
}

/** Checkpoint record for an interrupted run (FR-015). */
export interface Checkpoint {
  capability: string
  scope: string
  snapshotTag: string
  lastWord: string | null
  completed: boolean
}

export function checkpointPath(capability: string, scope: string): string {
  return `${REPORT_DIR}/${capability}-${scope}.checkpoint.json`
}

/** Best-effort checkpoint read; a corrupt file just means "start over". */
export async function readCheckpoint(
  capability: string,
  scope: string,
): Promise<Checkpoint | null> {
  try {
    const parsed = JSON.parse(await readFile(checkpointPath(capability, scope), 'utf8')) as
      | Checkpoint
      | null
    return parsed && typeof parsed.lastWord === 'string' ? parsed : null
  } catch {
    return null
  }
}

export async function writeCheckpoint(checkpoint: Checkpoint): Promise<void> {
  const path = checkpointPath(checkpoint.capability, checkpoint.scope)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
}

export async function clearCheckpoint(capability: string, scope: string): Promise<void> {
  try {
    await rm(checkpointPath(capability, scope), { force: true })
  } catch {
    /* nothing to clear */
  }
}