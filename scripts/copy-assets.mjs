import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'dist', 'client'), { recursive: true })
cpSync(join(root, 'src', 'client', 'Search.vue'), join(root, 'dist', 'client', 'Search.vue'))
console.log('copied src/client/Search.vue -> dist/client/Search.vue')
