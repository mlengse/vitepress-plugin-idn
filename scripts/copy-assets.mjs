import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'dist', 'client'), { recursive: true })
cpSync(join(root, 'src', 'client', 'Search.vue'), join(root, 'dist', 'client', 'Search.vue'))
cpSync(
  join(root, 'src', 'client', 'indexLoader.ts'),
  join(root, 'dist', 'client', 'indexLoader.ts'),
)
cpSync(
  join(root, 'src', 'client', 'hyphenationRuntime.ts'),
  join(root, 'dist', 'client', 'hyphenationRuntime.ts'),
)
cpSync(join(root, 'src', 'vue.d.ts'), join(root, 'dist', 'vue.d.ts'))

// SC-010-style guard for the /vue entry (T036): the entry must be plain ESM.
// It used to be a hand-written re-export of the raw SFC, which Node's ESM
// loader (ERR_UNKNOWN_FILE_EXTENSION) and any bundler without a Vue loader
// cannot resolve - only a Vite pipeline with a Vue plugin could. A packaging
// regression must fail the build loudly instead of silently emitting that
// again; the compiled entry comes from scripts/build-vue-entry.mjs.
const VUE_ENTRY = 'vue.js'
const vueEntry = join(root, 'dist', VUE_ENTRY)
if (/(?:import|export)\b[^;'"]*['"][^'"]*\.vue['"]/.test(readFileSync(vueEntry, 'utf8'))) {
  throw new Error(
    `${VUE_ENTRY} still imports a '.vue' path - the /vue entry must be the ` +
      'precompiled plain ESM emitted by scripts/build-vue-entry.mjs.',
  )
}

// `hyphenasi` (github.com/mlengse/hyphenasi, FR-023) ships an `exports` map
// with `"./*": "./*/index.js"`, so `hyphenasi/id` and `hyphenasi/en` resolve
// under plain Node ESM with no rewrite needed. The old `hyphen` (CJS, no
// exports map) required rewriting bare directory imports to explicit
// `/index.js` subpaths; that patch is intentionally gone with the dependency.
// Kept as an assertion so a future packaging regression fails the build loudly
// instead of silently emitting an unresolvable dist entry (SC-010).
for (const file of ['index.js', 'node/index.js']) {
  const path = join(root, 'dist', file)
  const code = readFileSync(path, 'utf8')
  if (/from (['"])hyphen\//.test(code)) {
    throw new Error(
      `${file} still imports the retired 'hyphen' package - expected the ` +
        `'hyphenasi' fork (FR-023).`,
    )
  }
}

console.log('copied dist/client/* + dist/vue.d.ts; verified the /vue entry is plain ESM and hyphenasi subpath imports')