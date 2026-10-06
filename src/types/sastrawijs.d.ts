/**
 * Type shim for `sastrawijs` (v1.1.0).
 *
 * The package ships `dist/index.d.ts` but its `exports` map exposes no
 * `types` condition, so `moduleResolution: "Bundler"` cannot resolve the
 * declarations (TS7016). Declaring the module here keeps strict typecheck
 * green without patching node_modules.
 */
declare module 'sastrawijs' {
  export class Stemmer {
    stem(word: string): string
  }
  export function stem(word: string): string
}
