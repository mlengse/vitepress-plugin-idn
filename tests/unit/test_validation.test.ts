/**
 * T038 - Options validation & host-hook composition (FR-020, SC-010,
 * contracts/plugin-options.md).
 *
 * SC-010 ("zero silent failures"): every documented invalid configuration
 * throws a build-visible error with the offending value; valid options merge
 * over defaults without error. Host `buildEnd`/`transformHead` hooks are
 * composed, never replaced (G4).
 */

import { describe, expect, it, vi } from 'vitest'
import { composeHook, resolveOptions } from '../../src/node/configResolved'

describe('resolveOptions - validation matrix (SC-010)', () => {
  it('unknown language throws a build-visible error listing the value', () => {
    expect(() => resolveOptions({ language: 'de' as never })).toThrow(
      /Unknown language: "de"/,
    )
  })

  it('invalid include / exclude shapes throw', () => {
    expect(() => resolveOptions({ include: '**/*.md' as never })).toThrow(/Invalid include/)
    expect(() => resolveOptions({ include: ['ok', 7 as never] })).toThrow(/Invalid include/)
    expect(() => resolveOptions({ exclude: 42 as never })).toThrow(/Invalid exclude/)
  })

  it('unknown ui throws; valid ui values are accepted', () => {
    expect(() => resolveOptions({ ui: 'inline' as never })).toThrow(/Unknown ui: "inline"/)
    expect(resolveOptions({ ui: 'nav' }).ui).toBe('nav')
    expect(resolveOptions({ ui: 'external' }).ui).toBe('external')
    expect(resolveOptions({ ui: false }).ui).toBe(false)
  })

  it('non-positive or non-numeric minIndexSizeWarningMB throws', () => {
    expect(() => resolveOptions({ minIndexSizeWarningMB: 0 })).toThrow(/Invalid minIndexSizeWarningMB/)
    expect(() => resolveOptions({ minIndexSizeWarningMB: -1 })).toThrow(/Invalid minIndexSizeWarningMB/)
    expect(() => resolveOptions({ minIndexSizeWarningMB: '5' as never })).toThrow(
      /Invalid minIndexSizeWarningMB/,
    )
  })

  it('returns documented defaults for an empty options object (G1)', () => {
    const resolved = resolveOptions()
    expect(resolved.enabled).toBe(true)
    expect(resolved.language).toBe('id')
    expect(resolved.include).toEqual(['**/*.md'])
    expect(resolved.exclude).toEqual([])
    expect(resolved.hyphenate.enabled).toBe(false)
    expect(resolved.hyphenate.minWordLength).toBe(6)
    expect(resolved.hyphenate.selector).toBe('.vp-doc p, .vp-doc li, .vp-doc td')
    expect(resolved.ui).toBe('nav')
    expect(resolved.minIndexSizeWarningMB).toBe(5)
  })

  it('merges partial options over defaults without mutating inputs', () => {
    const input = { language: 'en' as const, hyphenate: { minWordLength: 3 } }
    const resolved = resolveOptions(input)
    expect(resolved.language).toBe('en')
    expect(resolved.hyphenate.minWordLength).toBe(3)
    expect(resolved.hyphenate.enabled).toBe(false)
    expect(resolved.exclude).toEqual([])
  })
})

describe('composeHook - host hooks are chained, not replaced (G4)', () => {
  it('returns ours when the host defines no hook', async () => {
    const ours = vi.fn()
    const composed = composeHook(undefined, ours)
    await composed()
    expect(ours).toHaveBeenCalledTimes(1)
  })

  it('runs the host hook first, then ours, and awaits both', async () => {
    const order: string[] = []
    const host = vi.fn(async () => {
      order.push('host')
    })
    const ours = vi.fn(async () => {
      order.push('ours')
    })
    const composed = composeHook(host, ours)
    await composed()
    expect(order).toEqual(['host', 'ours'])
  })

  it('propagates a throwing host hook', async () => {
    const host = vi.fn(async () => {
      throw new Error('host failed')
    })
    const ours = vi.fn()
    const composed = composeHook(host, ours)
    await expect(composed()).rejects.toThrow('host failed')
    expect(ours).not.toHaveBeenCalled()
  })
})