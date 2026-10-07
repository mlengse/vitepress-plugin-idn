import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
writeFileSync(
  join(root, 'dist', 'vue.js'),
  [
    '// `vitepress-plugin-idn/vue` entry: re-export the shipped SFC (T036).',
    "export { default as IdnSearch } from './client/Search.vue'\n",
  ].join('\n'),
)

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

console.log('generated dist/vue.js; verified hyphenasi subpath imports; copied dist/client/* + dist/vue.d.ts')