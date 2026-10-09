/**
 * T056: `snapshot --force` is the explicit refresh path (US4/AC4, FR-011).
 *
 * The CLI used to advertise `--force` in a message while never honouring it and
 * while returning early whenever a snapshot existed - the flag was dead. This
 * test pins the branch so the promise and the behaviour cannot drift apart
 * again, and it does so without touching the network: the snapshot module is
 * mocked, so the assertion is about CLI wiring, not about downloading data.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hasSnapshot: vi.fn(),
  captureSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  loadDefectStore: vi.fn(),
  isStillReproducing: vi.fn(),
}))

vi.mock('../../tools/kbbi/snapshot.ts', () => ({
  hasSnapshot: mocks.hasSnapshot,
  captureSnapshot: mocks.captureSnapshot,
  loadSnapshot: mocks.loadSnapshot,
  SnapshotError: class SnapshotError extends Error {},
}))

vi.mock('../../tools/kbbi/compare.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../tools/kbbi/compare.ts')>()
  return { ...actual, loadDefectStore: mocks.loadDefectStore }
})

vi.mock('../../tools/kbbi/stages.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../tools/kbbi/stages.ts')>()
  return { ...actual, isStillReproducing: mocks.isStillReproducing }
})

import { runCli } from '../../tools/kbbi/cli.ts'

const FAKE_SNAPSHOT = {
  toolkitVersion: 1,
  tag: 'data-v4',
  capturedAt: '2026-10-07T00:00:00.000Z',
  entryCount: { derived: 1, rootWords: 1, syllables: 1 },
  files: [
    {
      path: 'lexicon/derived_to_root_with_kelas.json',
      blobSha: '4bdde8ad0cc8df523dc6b1d25558ac9843507afc',
      bytes: 1,
      sha256: 'a'.repeat(64),
    },
  ],
}

beforeEach(() => {
  mocks.hasSnapshot.mockReset()
  mocks.captureSnapshot.mockReset()
  mocks.loadSnapshot.mockReset()
  mocks.loadDefectStore.mockReset()
  mocks.isStillReproducing.mockReset()
  mocks.captureSnapshot.mockResolvedValue(FAKE_SNAPSHOT)
  mocks.loadDefectStore.mockResolvedValue([])
  mocks.isStillReproducing.mockReturnValue(false)
  // commandSnapshot logs progress; keep the test output readable.
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('snapshot --force (T056, US4/AC4, FR-011)', () => {
  it('leaves an existing checksum-valid snapshot untouched without --force', async () => {
    mocks.hasSnapshot.mockResolvedValue(true)

    expect(await runCli(['snapshot'])).toBe(0)
    expect(mocks.captureSnapshot).not.toHaveBeenCalled()
  })

  it('re-takes the snapshot with --force even when one already exists', async () => {
    mocks.hasSnapshot.mockResolvedValue(true)

    expect(await runCli(['snapshot', '--force'])).toBe(0)
    expect(mocks.captureSnapshot).toHaveBeenCalledTimes(1)
  })

  it('takes a snapshot when none exists, with or without --force', async () => {
    mocks.hasSnapshot.mockResolvedValue(false)

    expect(await runCli(['snapshot'])).toBe(0)
    expect(mocks.captureSnapshot).toHaveBeenCalledTimes(1)

    mocks.captureSnapshot.mockClear()
    expect(await runCli(['snapshot', '--force'])).toBe(0)
    expect(mocks.captureSnapshot).toHaveBeenCalledTimes(1)
  })
})

describe('triage command is advertised (T005, US1, FR-001)', () => {
  it('lists the triage usage line in --help output', async () => {
    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    expect(await runCli(['--help'])).toBe(0)
    expect(writes.join('')).toContain('kbbi-validate triage')
  })
})

describe('status reports closure-path coverage (T015, US1/AC4, SC-001, FR-001)', () => {
  const capture = (): string[] => {
    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    return writes
  }

  it('splits open findings into those with a closure path and those without', async () => {
    mocks.loadDefectStore.mockResolvedValue([
      // Non-failure class, no stage -> path via `triage`.
      { word: 'kata1', capability: 'syllable', class: 'reference-missing', status: 'open', stage: null },
      // Failure class that still reproduces -> path via the stage workflow.
      { word: 'kata2', capability: 'stem', class: 'candidate-bug', status: 'open', stage: null },
      // Failure class that no longer reproduces -> the one case with no path.
      { word: 'kata3', capability: 'stem', class: 'candidate-bug', status: 'open', stage: null },
      // Already closed -> never counted as open.
      { word: 'kata4', capability: 'stem', class: 'candidate-bug', status: 'dismissed', stage: null },
    ])
    mocks.isStillReproducing.mockImplementation(
      (defect: { word: string }) => defect.word !== 'kata3',
    )

    const writes = capture()
    expect(await runCli(['status'])).toBe(0)

    const output = writes.join('')
    expect(output).toContain('3 terbuka')
    expect(output).toContain('2 punya jalur penutup')
    expect(output).toContain('1 tanpa jalur penutup')
  })

  it('reports zero without-path findings when every open finding is closable', async () => {
    mocks.loadDefectStore.mockResolvedValue([
      { word: 'kata1', capability: 'syllable', class: 'reference-missing', status: 'open', stage: null },
    ])
    mocks.isStillReproducing.mockReturnValue(true)

    const writes = capture()
    expect(await runCli(['status'])).toBe(0)

    const output = writes.join('')
    expect(output).toContain('1 terbuka')
    expect(output).toContain('0 tanpa jalur penutup')
  })
})
