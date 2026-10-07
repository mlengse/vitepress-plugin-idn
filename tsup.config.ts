import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/search': 'src/core/search.ts',
    'node/index': 'src/node/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['vitepress', 'vue', 'vite'],
  splitting: false,
})