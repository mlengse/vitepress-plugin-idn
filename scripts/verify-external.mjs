/**
 * T036 `ui: 'external'` verification (FR-019, plugin-options.md).
 *
 * Builds the playground using the PACKAGED package entry points -- `import {
 * idnPlugin } from 'vitepress-plugin-idn/node'` and `IdnSearch` from
 * 'vitepress-plugin-idn/vue' -- with NO vite.resolve.alias shortcuts. Both
 * resolve through `exports` via Node/Vite package self-reference against the
 * dist/ output of `npm run build` (which must be run first).
 *
 * Passing means the published layout (`dist/node/index.js`, `dist/vue.js`,
 * `dist/client/Search.vue`, `dist/core/search.js`) is consumable by a real
 * VitePress site with `ui: 'external'`, and the plugin's virtual options
 * module is still served to the externally-mounted component.
 *
 * Exit code 0 = verified. Run: npm run verify:external
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const site = join(root, 'playground')
const vitepressBin = join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js')
const configPath = join(site, '.vitepress', 'config.ts')
const themePath = join(site, '.vitepress', 'theme', 'index.ts')
const distOut = join(site, '.vitepress', 'dist')

if (!existsSync(join(root, 'dist', 'index.js')) || !existsSync(join(root, 'dist', 'vue.js'))) {
  console.error('[verify:external] dist/ missing - run `npm run build` first')
  process.exit(1)
}

const EXTERNAL_CONFIG = `import { defineConfig } from 'vitepress'
import { idnPlugin } from 'vitepress-plugin-idn/node'

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'id',
  cleanUrls: true,
  vite: {
    // No alias to src/: resolves vitepress-plugin-idn via package exports.
    plugins: [idnPlugin({ ui: 'external' })],
  },
})
`

const EXTERNAL_THEME = `import DefaultTheme from 'vitepress/theme'
import { IdnSearch } from 'vitepress-plugin-idn/vue'

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('IdnSearch', IdnSearch)
  },
}
`

const originalConfig = readFileSync(configPath, 'utf8')
const originalTheme = readFileSync(themePath, 'utf8')
let failed = false
try {
  writeFileSync(configPath, EXTERNAL_CONFIG)
  writeFileSync(themePath, EXTERNAL_THEME)
  const res = spawnSync(process.execPath, [vitepressBin, 'build', site], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
  })
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`external build failed (${res.status})\n${output}`)

  const chunks = readdirSync(join(distOut, 'assets'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath, e.name))
  const hits = chunks.filter((file) => {
    try {
      return readFileSync(file, 'utf8').includes('idn-trigger')
    } catch {
      return false
    }
  })
  if (hits.length === 0) {
    failed = true
    console.error('[verify:external] no compiled Search.vue (idn-trigger) found among dist assets')
  } else {
    console.log(`[verify:external] IdnSearch compiled from real package entry into ${hits.length} asset(s)`)
  }
  console.log('[verify:external] ui:external + package self-reference build OK (T036)')
} catch (err) {
  failed = true
  console.error(err instanceof Error ? err.message : String(err))
} finally {
  writeFileSync(configPath, originalConfig)
  writeFileSync(themePath, originalTheme)
}

process.exit(failed ? 1 : 0)