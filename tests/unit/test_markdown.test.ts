import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { expandIncludes } from '../../src/node/markdown'

describe('expandIncludes', () => {
  it('expands region includes correctly', () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const includedFile = join(tmpDir, 'snippet.js')
    const fileContent = [
      'const a = 1;',
      '// #region snippet-1',
      'const b = 2;',
      'const c = 3;',
      '// #endregion snippet-1',
      'const d = 4;',
    ].join('\n')

    writeFileSync(includedFile, fileContent, 'utf8')

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = '<!-- @include: ./snippet.js#snippet-1 -->'

    const result = expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe('const b = 2;\nconst c = 3;')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handles non-existent region gracefully (slice(undefined, undefined) returns all lines)', () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const includedFile = join(tmpDir, 'snippet.js')
    const fileContent = [
      'const a = 1;',
      '// #region snippet-1',
      'const b = 2;',
      '// #endregion snippet-1',
    ].join('\n')

    writeFileSync(includedFile, fileContent, 'utf8')

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = '<!-- @include: ./snippet.js#non-existent -->'

    const result = expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe(fileContent)

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
