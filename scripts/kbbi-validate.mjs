#!/usr/bin/env node
/**
 * Entry point for the KBBI validation toolkit (T003, FR-017).
 *
 * Deliberately thin, and deliberately the only `.mjs` in the toolkit: it parses
 * nothing, decides nothing, and owns no state. It forwards argv to
 * `tools/kbbi/cli.ts` and forwards the exit code back, following the pattern
 * already used by `scripts/update-stopwords.ts`, so a contributor has no new
 * path to learn.
 *
 * The toolkit lives under `tools/`, never `src/`: `tsup` only builds `src/`, so
 * nothing here can enter `dist/` or the published package (Prinsip III).
 *
 * Two Node capabilities are used instead of a build step or a new dependency:
 *
 * 1. **Type stripping** (Node >= 22.18): `tools/kbbi/*.ts` runs as-is, no
 *    transpile, no loader flag, no new dependency. This is why the files use
 *    erasable-only syntax.
 * 2. **A resolver hook**: `src/core/*.ts` is authored for the bundler and
 *    writes relative imports without extensions (`./stem`). Node's ESM resolver
 *    requires them, and `src/` is published source that must not be rewritten
 *    for a maintainer's convenience - so the shim lives here, at the one
 *    boundary that needs it, instead of touching runtime code.
 *
 * The published package still supports Node >= 20; only this internal
 * development toolkit requires >= 22.18.
 */

import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

if (typeof registerHooks !== 'function') {
  process.stderr.write(
    'kbbi-validate membutuhkan Node >= 22.18 (type stripping bawaan).\n' +
      'Paket yang dipublikasikan tetap mendukung Node >= 20; hanya perkakas internal ini yang lebih baru.\n',
  )
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentURL = context.parentURL
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && parentURL) {
      // Only .ts/.mjs parents are ours to patch; anything else resolves normally.
      if (parentURL.endsWith('.ts') || parentURL.endsWith('.mjs')) {
        // `src/core/stopwords` is a directory whose entry is `index.ts`.
        for (const candidateSpecifier of [`${specifier}.ts`, `${specifier}/index.ts`]) {
          try {
            const candidate = new URL(candidateSpecifier, parentURL)
            if (existsSync(fileURLToPath(candidate))) return nextResolve(candidateSpecifier, context)
          } catch {
            /* not a file URL, or unreadable: fall through to the default resolver */
          }
        }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { runCli } = await import('../tools/kbbi/cli.ts')
process.exitCode = await runCli(process.argv.slice(2))