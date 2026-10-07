/**
 * Shared build fixture (T019/T021/T025/T031/T036).
 *
 * Building the playground once here - before any integration test runs - lets
 * every integration spec read the same `playground/.vitepress/dist` artifacts
 * instead of racing each other on `vitepress build`.
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')

export default function setup(): void {
  execSync('npx vitepress build playground', {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: 300_000,
  })
}