import { defineConfig } from 'vitepress'
import { idnPlugin } from '../../src/node'

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'en',
  cleanUrls: true,
  vite: {
    plugins: [idnPlugin()],
  },
})
