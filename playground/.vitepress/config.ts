import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'
import { idnPlugin } from '../../src/node'

const here = resolve(__dirname, '..', '..')

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'en',
  cleanUrls: true,
  vite: {
    plugins: [
      idnPlugin({
        // Hyphenation is on so T031's build can assert the injected runtime
        // while US1's search assertions remain valid.
        hyphenate: { enabled: true, minWordLength: 6 },
      }),
    ],
    // Let the fixture import the *real* public entry points exactly as an
    // end user would (`vitepress-plugin-idn` / `vitepress-plugin-idn/vue`).
    resolve: {
      alias: [
        { find: /^vitepress-plugin-idn\/vue$/, replacement: resolve(here, 'src', 'vue.ts') },
        { find: /^vitepress-plugin-idn$/, replacement: resolve(here, 'src', 'index.ts') },
      ],
    },
  },
})




