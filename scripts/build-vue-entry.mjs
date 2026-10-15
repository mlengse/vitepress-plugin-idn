/**
 * T036 - compile the shipped SFC into plain ESM for the `/vue` entry.
 *
 * `dist/vue.js` used to be a hand-written re-export of the RAW SFC
 * (`export { default as IdnSearch } from './client/Search.vue'`), which only
 * resolves inside a pipeline that has a Vue compiler: Node's ESM loader dies
 * with ERR_UNKNOWN_FILE_EXTENSION on the `.vue` extension, and any bundler
 * without a Vue loader fails the same way. Compiling the SFC here keeps the
 * public entry - and its whole import graph - ordinary ESM.
 *
 * Two specifiers in the compiled output cannot survive as static imports
 * outside a Vite build, so they are rewritten to build-time-safe forms:
 *
 * - `vitepress` (`withBase`): the compiled module also has to EVALUATE under
 *   plain Node, where vitepress's client entry does not resolve. Replaced by
 *   a local copy of VitePress's own withBase (vitepress/dist/client/app/
 *   utils.js - same EXTERNAL_URL_RE guard, same slash-collapsing join)
 *   driven by `import.meta.env.BASE`, which Vite replaces in every bundled
 *   module, dependencies included.
 * - `virtual:vitepress-plugin-idn/options`: a Vite virtual module, invisible
 *   to Node and to non-Vite bundlers. Replaced by a `typeof __IDN_OPTIONS__`
 *   guard whose fallback mirrors DEFAULT_OPTIONS from `src/core/types.ts`
 *   (loaded from that file - not copied here - so the two cannot drift).
 *   The plugin defines the real value in consumer builds (src/node/index.ts),
 *   so a site's own language and translations still win inside VitePress.
 *
 * `dist/client/Search.vue` is still copied by `scripts/copy-assets.mjs`:
 * `resolveSearchVue()` (src/node/index.ts) aliases that exact file for the
 * `ui: 'nav'` default-theme UI, which keeps compiling the SFC itself.
 *
 * The SFC's `<style scoped>` block is compiled here too, into
 * `dist/client/Search.css`, because `compileScript` handles only the script (and
 * inline template) - CSS lives in `descriptor.styles` and is normally compiled
 * by `compileStyle` and injected by `@vitejs/plugin-vue`, neither of which runs
 * for a precompiled entry. Skipping it shipped a component with no styles at all
 * on the `ui: 'external'` path, so this step is load-bearing, not cosmetic. The
 * generated module must NOT `import` the CSS statically: Node's ESM loader
 * cannot load `.css`, and `tests/contract/test_vue_entry.test.ts` requires the
 * entry to import cleanly under plain Node. Consumers load it via the
 * `vitepress-plugin-idn/vue.css` export instead.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// Both are declared devDependencies (typescript) or peer/devDependencies
// (vue); resolve them from the project root.
const require = createRequire(join(root, 'package.json'))
const { compileScript, compileStyle, parse } = require('vue/compiler-sfc')
const ts = require('typescript')

const SFC_PATH = join(root, 'src', 'client', 'Search.vue')
const CLIENT_OUT_DIR = join(root, 'dist', 'client')
const COMPILED_PATH = join(CLIENT_OUT_DIR, 'Search.js')
const STYLE_PATH = join(CLIENT_OUT_DIR, 'Search.css')
const ENTRY_PATH = join(root, 'dist', 'vue.js')

/**
 * Scope id for the SFC's `<style scoped>` block. `compileScript` does not emit
 * one (`@vitejs/plugin-vue` attaches it at SFC-compile time), so this build
 * attaches `__scopeId` from this same value and `compileStyle` bakes
 * `[data-v-<SCOPE_ID>]` into the CSS - one constant keeps the two in lockstep.
 * Derived from a fixed string rather than the absolute path so the id is
 * byte-stable across machines and rebuilds.
 */
const SCOPE_ID = createHash('sha256')
  .update('vitepress-plugin-idn/client/Search.vue')
  .digest('hex')
  .slice(0, 8)

/**
 * Local name `compileScript` gives the component via `genDefaultAs`, so this
 * build can attach `__scopeId` and export it itself (compileScript then emits no
 * `export default`).
 */
const SFC_IDENTIFIER = '_sfc_main'

/**
 * Default options for the fallback, taken from the same module the plugin
 * resolves with (single source of truth). `src/core/types.ts` is import-free
 * and type-erased by transpileModule, so a data: URL loads it without a build
 * step and without duplicating the literals here.
 */
async function loadFallbackOptions() {
  const source = readFileSync(join(root, 'src', 'core', 'types.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`)
  const defaults = mod.DEFAULT_OPTIONS
  return { language: defaults.language, translations: defaults.translations }
}

const VITEPRESS_IMPORT = /^import\s*\{\s*withBase\s*\}\s*from\s*['"]vitepress['"];?[ \t]*$/m
const VIRTUAL_OPTIONS_IMPORT =
  /^import\s+options\s+from\s+['"]virtual:vitepress-plugin-idn\/options['"];?[ \t]*$/m
// The SFC imports the shared pipeline through the source-relative specifier
// '../core/search'; Node ESM needs the explicit extension (tsup emits the
// matching dist/core/search.js entry - Vite resolves either spelling).
const CORE_SEARCH_IMPORT =
  /^import\s*\{\s*search\s*\}\s*from\s*['"]\.\.\/core\/search['"];?[ \t]*$/m

async function buildVueEntry() {
  const { descriptor, errors } = parse(readFileSync(SFC_PATH, 'utf8'), { filename: 'Search.vue' })
  if (errors.length > 0) {
    throw new Error(`Search.vue failed to parse: ${errors.map(String).join('\n')}`)
  }

  // inlineTemplate compiles <template> against the script bindings, so the
  // emitted module carries its own render function; mode: 'module' keeps the
  // runtime helpers as ESM imports from the external `vue` (peer dep).
  // genDefaultAs names the component instead of exporting it, so __scopeId can
  // be attached below before the single default export is emitted.
  const { content } = compileScript(descriptor, {
    id: SCOPE_ID,
    isProd: true,
    inlineTemplate: true,
    genDefaultAs: SFC_IDENTIFIER,
    templateOptions: { compilerOptions: { mode: 'module' } },
  })

  // <script setup lang="ts"> stays TypeScript after compileScript; strip the
  // types without touching any specifier (transpileModule keeps imports).
  const { outputText, diagnostics } = ts.transpileModule(content, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  })
  if (diagnostics && diagnostics.length > 0) {
    throw new Error(
      `Search.vue failed to transpile: ${diagnostics.map(String).join('\n')}`,
    )
  }

  // Fail loudly if the SFC's imports move: a silent miss here would ship an
  // entry that only works inside a Vite pipeline again (the original defect).
  for (const [label, pattern] of [
    ['vitepress', VITEPRESS_IMPORT],
    ['virtual options', VIRTUAL_OPTIONS_IMPORT],
    ['core search', CORE_SEARCH_IMPORT],
  ]) {
    if (!pattern.test(outputText)) {
      throw new Error(
        `Search.vue no longer has the expected ${label} import - update the ` +
          'rewrite in scripts/build-vue-entry.mjs so the /vue entry stays ' +
          'loadable outside a Vite build.',
      )
    }
  }

  // Guard the genDefaultAs contract: if compileScript stops emitting the named
  // component the appended __scopeId/export below would reference nothing.
  if (!new RegExp(`const ${SFC_IDENTIFIER}\\s*=`).test(outputText)) {
    throw new Error(
      `compileScript did not emit 'const ${SFC_IDENTIFIER} =' - update genDefaultAs in ` +
        'scripts/build-vue-entry.mjs (the build appends __scopeId and the default export).',
    )
  }

  const coreSearchEntry = join(root, 'dist', 'core', 'search.js')
  if (!existsSync(coreSearchEntry)) {
    throw new Error(
      'dist/core/search.js is missing - tsup must emit it before this script ' +
        '(the compiled entry imports ../core/search.js).',
    )
  }

  const fallback = await loadFallbackOptions()

  const compiled = outputText
    .replace(CORE_SEARCH_IMPORT, (match) =>
      match.replace(/['"]\.\.\/core\/search['"]/, "'../core/search.js'"),
    )
    .replace(
      VITEPRESS_IMPORT,
      [
        '// Local copy of VitePress withBase (vitepress/dist/client/app/utils.js):',
        '// same EXTERNAL_URL_RE guard and slash-collapsing join. The base is',
        '// runtime data - `import.meta.env.BASE` is replaced by Vite in every',
        "// bundled module, dependencies included, so a consumer's base still wins.",
        "const IDN_SITE_BASE = (import.meta.env && import.meta.env.BASE) || '/'",
        'function withBase(path) {',
        '  return /^(?:[a-z]+:|\\/\\/)/i.test(path) || !path.startsWith(\'/\')',
        '    ? path',
        '    : `${IDN_SITE_BASE}${path}`.replace(/\\/+/g, \'/\')',        '}',
      ].join('\n'),
    )
    .replace(
      VIRTUAL_OPTIONS_IMPORT,
      [
        '// Site options: the plugin defines __IDN_OPTIONS__ in consumer builds',
        '// (src/node/index.ts); the fallback mirrors DEFAULT_OPTIONS from',
        '// src/core/types.ts for contexts without the plugin (plain Node,',
        '// non-Vite bundlers), where the search index cannot load anyway.',
        `const options = typeof __IDN_OPTIONS__ !== 'undefined' ? __IDN_OPTIONS__ : ${JSON.stringify(fallback)}`,
      ].join('\n'),
    )

  mkdirSync(CLIENT_OUT_DIR, { recursive: true })
  writeFileSync(
    COMPILED_PATH,
    [
      '// GENERATED by scripts/build-vue-entry.mjs from src/client/Search.vue.',
      '// Precompiled for the `vitepress-plugin-idn/vue` entry (T036): plain ESM,',
      '// no SFC transform required from consumers. Do not edit.',
      '',
      compiled,
      '',
      '// Scope id for the <style scoped> block shipped as ./Search.css. Both the',
      '// attribute here and the `[data-v-...]` in that file come from SCOPE_ID in',
      '// scripts/build-vue-entry.mjs; if they drift the CSS matches nothing.',
      `${SFC_IDENTIFIER}.__scopeId = ${JSON.stringify(`data-v-${SCOPE_ID}`)}`,
      `export default ${SFC_IDENTIFIER}`,
      '',
    ].join('\n'),
    'utf8',
  )

  // <style scoped> -> dist/client/Search.css (see the file header for why this
  // is required, and why the compiled module must not import it).
  if (descriptor.styles.length === 0) {
    throw new Error(
      'src/client/Search.vue has no <style> block - the /vue entry would ship ' +
        'unstyled. Restore the styles or remove the CSS emission and its assertions.',
    )
  }
  const css = descriptor.styles
    .map((style) => {
      const result = compileStyle({
        source: style.content,
        filename: SFC_PATH,
        id: SCOPE_ID,
        scoped: style.scoped,
      })
      if (result.errors.length > 0) {
        throw new Error(
          `Search.vue <style> failed to compile: ${result.errors.map(String).join('\n')}`,
        )
      }
      return result.code
    })
    .join('\n')
  if (!css.includes('.idn-overlay') || !css.includes(`data-v-${SCOPE_ID}`)) {
    throw new Error(
      'dist/client/Search.css is missing expected rules (.idn-overlay / scope id) - ' +
        'the /vue entry would ship unstyled.',
    )
  }
  writeFileSync(
    STYLE_PATH,
    [
      '/* GENERATED by scripts/build-vue-entry.mjs from src/client/Search.vue. */',
      `/* Scoped to data-v-${SCOPE_ID}; import via 'vitepress-plugin-idn/vue.css'. */`,
      '',
      css,
      '',
    ].join('\n'),
    'utf8',
  )

  writeFileSync(
    ENTRY_PATH,
    [
      '// `vitepress-plugin-idn/vue` entry (T036): the SFC is compiled at build',
      '// time into ./client/Search.js, so this entry - and everything it',
      '// imports - is plain ESM that Node and non-Vite bundlers can resolve.',
      '// `vue` is the only runtime dependency of the entry.',
      "export { default as IdnSearch } from './client/Search.js'\n",
    ].join('\n'),
    'utf8',
  )

  console.log(
    'generated dist/vue.js + dist/client/Search.js + dist/client/Search.css from src/client/Search.vue',
  )
}

await buildVueEntry()
