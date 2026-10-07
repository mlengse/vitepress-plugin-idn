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
}))

vi.mock('../../tools/kbbi/snapshot.ts', () => ({
  hasSnapshot: mocks.hasSnapshot,
  captureSnapshot: mocks.captureSnapshot,
  loadSnapshot: mocks.loadSnapshot,
  SnapshotError: class SnapshotError extends Error {},
}))

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
  mocks.captureSnapshot.mockResolvedValue(FAKE_SNAPSHOT)
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
