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

// The /vue entry's `<style scoped>` ships separately as dist/client/Search.css:
// compileScript handles the script (and inline template) only, so the CSS is
// compiled by scripts/build-vue-entry.mjs into that file. Guard the pair - the
// scope id baked into the CSS must equal the component's `__scopeId`, or the
// stylesheet matches nothing and ui: 'external' renders unstyled, which is the
// defect this pair exists to prevent.
const STYLE_PATH = 'client/Search.css'
const COMPILED_PATH = 'client/Search.js'
const css = readFileSync(join(root, 'dist', STYLE_PATH), 'utf8')
const component = readFileSync(join(root, 'dist', COMPILED_PATH), 'utf8')
const cssScope = /data-v-([0-9a-f]+)/.exec(css)?.[1]
const moduleScope = /__scopeId\s*=\s*['"]data-v-([0-9a-f]+)['"]/.exec(component)?.[1]
if (!cssScope || !css.includes('.idn-overlay')) {
  throw new Error(
    `dist/${STYLE_PATH} is missing expected rules or a scope id - the /vue ` +
      'entry would ship unstyled.',
  )
}
if (cssScope !== moduleScope) {
  throw new Error(
    `scope id mismatch: dist/${STYLE_PATH} scopes to data-v-${cssScope} but ` +
      `dist/${COMPILED_PATH} sets __scopeId data-v-${moduleScope} - the shipped ` +
      'CSS would match nothing.',
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

console.log(
  'copied dist/client/* + dist/vue.d.ts; verified the /vue entry is plain ESM, ' +
    'its scoped CSS pair (Search.css/Search.js) shares one scope id, and hyphenasi subpath imports',
)