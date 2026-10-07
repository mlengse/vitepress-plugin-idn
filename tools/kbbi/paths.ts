/**
 * Filesystem layout of the validation workdir (R12, FR-017, FR-018).
 *
 * Everything the toolkit writes lives under `.kbbi/`, which is gitignored and
 * outside `dist/`. The split is structural rather than a convention: `tsup`
 * only builds `src/`, and `package.json` `files` only lists `dist` and
 * `NOTICE`, so neither the toolkit nor the KBBI payload can reach the
 * published package by any route other than an explicit edit of those files.
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root, derived from this file's own location. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Workdir root. Gitignored; never committed, never packaged. */
export const WORK_DIR = join(REPO_ROOT, '.kbbi')

/** Pinned dataset payload plus its manifest. */
export const SNAPSHOT_DIR = join(WORK_DIR, 'snapshot')

/** One directory per tag, e.g. `.kbbi/snapshot/data-v4`. */
export const snapshotTagDir = (tag: string): string => join(SNAPSHOT_DIR, tag)

export const snapshotManifestPath = (tag: string): string =>
  join(snapshotTagDir(tag), 'manifest.json')

/** Downloaded files live under `raw/`, mirroring their repo-relative path. */
export const snapshotRawPath = (tag: string, repoPath: string): string =>
  join(snapshotTagDir(tag), 'raw', repoPath)

/** Measurement reports: markdown for humans, JSONL for machines (R11). */
export const REPORT_DIR = join(WORK_DIR, 'reports')

/** Accumulated defect store, deduplicated on `(capability, word, referenceOutput)`. */
export const DEFECTS_DIR = join(WORK_DIR, 'defects')

export const OPEN_DEFECTS_PATH = join(DEFECTS_DIR, 'open.jsonl')

/** Full regression-case records, metadata included. Never committed. */
export const REGRESSION_CASES_PATH = join(DEFECTS_DIR, 'regression-cases.json')

/** Stage records: `.kbbi/stages/stage-01.json`. */
export const STAGE_DIR = join(WORK_DIR, 'stages')

export const stagePath = (id: string): string => join(STAGE_DIR, `${id}.json`)

/** Committed curated fixtures (R3). Only these leave the workdir. */
export const REGRESSION_FIXTURE = {
  stem: join(REPO_ROOT, 'tests', 'fixtures', 'kbbi-regression-stem.json'),
  syllable: join(REPO_ROOT, 'tests', 'fixtures', 'kbbi-regression-syllable.json'),
} as const

/** Golden fixtures that a fix may invalidate (FR-023). */
export const GOLDEN_FIXTURE = {
  stem: join(REPO_ROOT, 'tests', 'fixtures', 'stem-golden.json'),
  syllable: join(REPO_ROOT, 'tests', 'fixtures', 'syllabify-golden.json'),
} as const