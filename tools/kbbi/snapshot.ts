/**
 * Snapshot acquisition and verification (T004, FR-011, FR-014, R2, R12).
 *
 * This is the **only** module in the toolkit that touches the network. Every
 * other command reads local files exclusively, which is what makes FR-012
 * ("measurement runs with no network and no MCP") structurally true rather
 * than a promise: delete this file's call graph from `measure` and nothing
 * breaks.
 *
 * Pinning is two-factor. The tag names a revision, and the blob SHA proves the
 * revision contains the exact bytes this feature was calibrated against. A
 * moved tag is rejected rather than silently measured against incomparable
 * data (R2).
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  SNAPSHOT_DIR,
  snapshotManifestPath,
  snapshotRawPath,
  snapshotTagDir,
} from './paths.ts'
import type { Snapshot, SnapshotEntryCount, SnapshotFile } from './types.ts'

/** The pinned tag. `main` is explicitly NOT used - see research R2. */
export const SNAPSHOT_TAG = 'data-v4'

/** Snapshot payload format version, written to and checked on the manifest. */
export const SNAPSHOT_TOOLKIT_VERSION = 1

/**
 * Blob SHAs from research R2. These are the values this feature's success
 * criteria were calibrated against; the manifest's copy is never the
 * authority, this table is.
 */
export const PINNED_FILES: ReadonlyArray<{ path: string; blobSha: string }> = [
  {
    path: 'lexicon/derived_to_root_with_kelas.json',
    blobSha: '4bdde8ad0cc8df523dc6b1d25558ac9843507afc',
  },
  { path: 'lexicon/derived_to_root.json', blobSha: 'ead996db97ac3dfe779a6a9393243aa39506c280' },
  { path: 'lexicon/root_words.txt', blobSha: '4a82a3c134c0b5acd9b9f8c2e55ef656a58063ab' },
  { path: 'lexicon/derived_words.txt', blobSha: '3e2d1f8c950addb59a90810955f5de2b6a069eaa' },
  {
    path: 'hyphenation/kbbi_vi_hyphenation_dict.json',
    blobSha: '664e7a99966e41af09fa90670b7a1685424c145b',
  },
  { path: 'hyphenation/kbbi_pemenggalan.txt', blobSha: '63d66a10bafd27ad7229239dbe26f2cf2cab517f' },
]

/**
 * The two files without which one of the two capabilities cannot be measured
 * at all (`contracts/snapshot-format.md`, "Jumlah minimum").
 */
export const REQUIRED_PATHS: readonly string[] = [
  'lexicon/derived_to_root_with_kelas.json',
  'hyphenation/kbbi_vi_hyphenation_dict.json',
]

const CDN_BASE = `https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@${SNAPSHOT_TAG}`
const RAW_BASE = `https://raw.githubusercontent.com/mlengse/kbbi-harvester-cdn/${SNAPSHOT_TAG}`
const TREE_API = 'https://api.github.com/repos/mlengse/kbbi-harvester-cdn/git/trees'

/** Thrown for every condition the snapshot contract says must stop the run. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotError'
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fetchBytes(repoPath: string): Promise<Buffer> {
  const urls = [`${CDN_BASE}/${repoPath}`, `${RAW_BASE}/${repoPath}`]
  const failures: string[] = []
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) {
        failures.push(`${url} -> HTTP ${response.status}`)
        continue
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      failures.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new SnapshotError(`unduhan gagal untuk ${repoPath}: ${failures.join(' | ')}`)
}

/**
 * Resolve each pinned path to a blob SHA at the pinned tag, via the GitHub
 * git-tree API. This is what turns "the tag" into "the exact bytes": a tag can
 * be moved, a tree entry cannot without changing its SHA.
 */
export async function fetchBlobShas(tag: string = SNAPSHOT_TAG): Promise<Map<string, string>> {
  const response = await fetch(`${TREE_API}/${tag}?recursive=1`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'vitepress-plugin-idn' },
  })
  if (!response.ok) {
    throw new SnapshotError(
      `gagal membaca tree tag ${tag} dari GitHub (HTTP ${response.status}). ` +
        `Snapshot ditolak; tidak ada jalur lain yang memverifikasi isi tag.`,
    )
  }
  const body = (await response.json()) as {
    tree?: Array<{ path?: string; sha?: string; type?: string }>
  }
  const shas = new Map<string, string>()
  for (const entry of body.tree ?? []) {
    if (entry.type === 'blob' && typeof entry.path === 'string' && typeof entry.sha === 'string') {
      shas.set(entry.path, entry.sha)
    }
  }
  return shas
}

async function countEntries(tag: string): Promise<SnapshotEntryCount> {
  const readJson = async (repoPath: string): Promise<Record<string, unknown>> => {
    const raw = await readFile(snapshotRawPath(tag, repoPath), 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  }
  const derived = await readJson('lexicon/derived_to_root_with_kelas.json')
  const syllables = await readJson('hyphenation/kbbi_vi_hyphenation_dict.json')
  const rootWords = (
    await readFile(snapshotRawPath(tag, 'lexicon/root_words.txt'), 'utf8')
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    derived: Object.keys(derived).length,
    rootWords: rootWords.length,
    syllables: Object.keys(syllables).length,
  }
}

/**
 * Download and pin the dataset.
 *
 * Rejects - loudly, naming both values - when a blob SHA at the tag disagrees
 * with the pinned table, or when the content SHA of a download disagrees with
 * the manifest about what was stored. There is no path that continues with
 * unverified data.
 */
export async function captureSnapshot(
  options: { tag?: string; now?: () => Date; log?: (line: string) => void } = {},
): Promise<Snapshot> {
  const tag = options.tag ?? SNAPSHOT_TAG
  const log = options.log ?? (() => {})
  const now = options.now ?? (() => new Date())

  const observed = await fetchBlobShas(tag)
  const files: SnapshotFile[] = []

  for (const pinned of PINNED_FILES) {
    const expected = pinned.blobSha
    const actual = observed.get(pinned.path)
    if (actual === undefined) {
      throw new SnapshotError(
        `path ${pinned.path} tidak ada di tree tag ${tag}. Snapshot ditolak.`,
      )
    }
    if (actual !== expected) {
      throw new SnapshotError(
        `blobSha tidak cocok untuk ${pinned.path}: ` +
          `diharapkan ${expected}, ditemukan ${actual}. Tag yang dipakai salah atau ` +
          `data upstream berubah. Snapshot ditolak agar pengukuran tidak diam-diam ` +
          `tidak sebanding.`,
      )
    }

    const bytes = await fetchBytes(pinned.path)
    const digest = sha256(bytes)
    const target = snapshotRawPath(tag, pinned.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    log(`${pinned.path}: ${bytes.length.toLocaleString('id-ID')} bytes, sha256 ${digest.slice(0, 12)}`)
    files.push({ path: pinned.path, blobSha: expected, bytes: bytes.length, sha256: digest })
  }

  for (const required of REQUIRED_PATHS) {
    if (!files.some((file) => file.path === required)) {
      throw new SnapshotError(
        `snapshot tidak lengkap: ${required} tidak diambil. Tanpa berkas ini salah satu ` +
          `kapabilitas tidak dapat diukur.`,
      )
    }
  }

  const entryCount = await countEntries(tag)
  const snapshot: Snapshot = {
    toolkitVersion: SNAPSHOT_TOOLKIT_VERSION,
    tag,
    capturedAt: now().toISOString(),
    entryCount,
    files,
  }

  await mkdir(snapshotTagDir(tag), { recursive: true })
  await writeFile(snapshotManifestPath(tag), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  return snapshot
}

/** Best-effort manifest read. Returns `null` when absent or unreadable. */
export async function readManifest(tag: string = SNAPSHOT_TAG): Promise<Snapshot | null> {
  try {
    const raw = await readFile(snapshotManifestPath(tag), 'utf8')
    const parsed = JSON.parse(raw) as Snapshot
    if (typeof parsed?.tag !== 'string' || !Array.isArray(parsed.files)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Load the pinned snapshot and verify its payload against the manifest.
 *
 * A manifest written by a *newer* toolkit version is a warning, not a
 * failure - interoperability rule in `contracts/snapshot-format.md`. A payload
 * whose checksum disagrees is a failure: the measurement would otherwise be
 * incomparable with itself across runs.
 */
export async function loadSnapshot(tag: string = SNAPSHOT_TAG): Promise<Snapshot> {
  const manifest = await readManifest(tag)
  if (!manifest) {
    throw new SnapshotError(
      `snapshot tidak ditemukan di ${SNAPSHOT_DIR}. ` +
        `Jalankan \`node scripts/kbbi-validate.mjs snapshot\` lebih dulu; ` +
        `tanpa snapshot tidak ada jalur lain ke data referensi.`,
    )
  }
  if (manifest.toolkitVersion > SNAPSHOT_TOOLKIT_VERSION) {
    process.stderr.write(
      `peringatan: manifest ditulis toolkit versi ${manifest.toolkitVersion}, ` +
        `kode ini versi ${SNAPSHOT_TOOLKIT_VERSION}. Lanjut dengan peringatan.\n`,
    )
  }

  for (const required of REQUIRED_PATHS) {
    if (!manifest.files.some((file) => file.path === required)) {
      throw new SnapshotError(
        `snapshot tidak lengkap: ${required} tidak ada di manifest. ` +
          `Ambil ulang snapshot.`,
      )
    }
  }

  for (const file of manifest.files) {
    const bytes = await readFile(snapshotRawPath(tag, file.path))
    const digest = sha256(bytes)
    if (digest !== file.sha256) {
      throw new SnapshotError(
        `sha256 tidak cocok untuk ${file.path}: manifest ${file.sha256}, ` +
          `isi berkas ${digest}. Berkas rusak; hapus dan ambil ulang snapshot.`,
      )
    }
  }
  return manifest
}

/** True when a usable snapshot already exists; used to skip needless downloads. */
export async function hasSnapshot(tag: string = SNAPSHOT_TAG): Promise<boolean> {
  try {
    await loadSnapshot(tag)
    return true
  } catch {
    return false
  }
}