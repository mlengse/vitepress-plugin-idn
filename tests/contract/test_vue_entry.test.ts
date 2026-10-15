/**
 * T036 - packaging contract for the public `/vue` entry (FR-019).
 *
 * The entry must be ordinary ESM: plain Node resolves it - no `.vue`
 * extension anywhere in its import graph - and it exports `IdnSearch`. This
 * is the assertion T036 never had: `npm run verify:external` masked the
 * defect because a VitePress build compiles the SFC through its own Vue
 * plugin, and only toolchains outside that pipeline (Node ESM, bundlers
 * without a Vue loader) ever hit it.
 */

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const DIST_VUE_ENTRY = join(ROOT, 'dist', 'vue.js')

// The entry is a build artifact; build it once, here, so the assertions below
// run against the exact bytes `npm run build` would ship.
beforeAll(() => {
  execSync('npm run build', { cwd: ROOT, stdio: 'pipe', timeout: 240_000 })
}, 240_000)

describe('/vue entry packaging (T036)', () => {
  it('is extension-clean ESM', () => {
    const code = readFileSync(DIST_VUE_ENTRY, 'utf8')
    expect(code).not.toMatch(/(?:import|export)\b[^;'"]*['"][^'"]*\.vue['"]/)
  })

  it('resolves under plain Node ESM and exports IdnSearch', () => {
    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const entry = await import('vitepress-plugin-idn/vue');" +
          "if (typeof entry.IdnSearch !== 'object' || entry.IdnSearch === null) {" +
          "  throw new Error('IdnSearch is not exported') } console.log('ok')",
      ],
      { cwd: ROOT, encoding: 'utf8' },
    )
    expect(probe.stderr).toBe('')
    expect(probe.status).toBe(0)
    expect(probe.stdout).toContain('ok')
  })
})
