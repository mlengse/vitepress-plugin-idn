/**
 * Type shims for packages whose published `exports` map does not expose a
 * `types` condition for the subpaths we import.
 *
 * `hyphenasi` (github.com/mlengse/hyphenasi — the user's fork of `hyphen`,
 * adopted per FR-023 / T051) ships a root-level `hyphen.d.ts` but no
 * declarations beside its per-language entry points (`id/index.js`,
 * `en/index.js`). Under `moduleResolution: "Bundler"` + `strict` these imports
 * fail TS7016. Declaring the modules here keeps strict typecheck green without
 * patching node_modules.
 *
 * Each language subpath exports a pre-built hyphenator factory whose
 * `hyphenateSync` runs the Liang algorithm synchronously (usable in both the
 * Node build and the browser bundle).
 */

declare module 'hyphenasi/id' {
  const hyphenator: {
    hyphenate(text: string, options?: Record<string, unknown>): string
    hyphenateSync(text: string, options?: Record<string, unknown>): string
    hyphenateHTML(text: string, options?: Record<string, unknown>): string
    hyphenateHTMLSync(text: string, options?: Record<string, unknown>): string
  }
  export default hyphenator
}

declare module 'hyphenasi/en' {
  const hyphenator: {
    hyphenate(text: string, options?: Record<string, unknown>): string
    hyphenateSync(text: string, options?: Record<string, unknown>): string
    hyphenateHTML(text: string, options?: Record<string, unknown>): string
    hyphenateHTMLSync(text: string, options?: Record<string, unknown>): string
  }
  export default hyphenator
}