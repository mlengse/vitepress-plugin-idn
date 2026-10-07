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

// The `hyphen` package (CJS, no `exports` map) only resolves `hyphen/id` /
// `hyphen/en` through a bundler's directory lookup. Node's ESM resolver (used
// when VitePress loads the published config) requires the exact file, so the
// bundled specifiers are rewritten to their explicit `/index.js` subpaths.
for (const file of ['index.js', 'node/index.js']) {
  const path = join(root, 'dist', file)
  const patched = readFileSync(path, 'utf8').replace(
    /from (['"])hyphen\/(id|en)\1/g,
    "from $1hyphen/$2/index.js$1",
  )
  writeFileSync(path, patched)
}

console.log('generated dist/vue.js; patched hyphen subpath imports; copied dist/client/* + dist/vue.d.ts')