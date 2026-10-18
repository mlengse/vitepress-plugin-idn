import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverPages, pagePathOf } from '../../src/node/scan'

describe('discoverPages', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      'test_discover_pages_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    )
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function createFile(relPath: string, content = '# Test'): string {
    const fullPath = join(tmpDir, relPath)
    const parentDir = join(fullPath, '..')
    mkdirSync(parentDir, { recursive: true })
    writeFileSync(fullPath, content, 'utf8')
    return fullPath
  }

  it('discovers all .md files recursively across subdirectories', () => {
    const file1 = createFile('index.md')
    const file2 = createFile('guide/intro.md')
    const file3 = createFile('guide/advanced/topics.md')

    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result.sort()).toEqual([file3, file2, file1].sort())
  })

  it('filters discovered files based on include globs', () => {
    createFile('index.md')
    const file2 = createFile('guide/intro.md')
    createFile('api/reference.md')

    const result = discoverPages(tmpDir, ['guide/**/*.md'], [])

    expect(result).toEqual([file2])
  })

  it('filters discovered files based on exclude globs', () => {
    const file1 = createFile('index.md')
    createFile('drafts/post1.md')
    const file3 = createFile('guide/intro.md')

    const result = discoverPages(tmpDir, ['**/*.md'], ['drafts/**'])

    expect(result.sort()).toEqual([file1, file3].sort())
  })

  it('combines include and exclude glob filters', () => {
    const file1 = createFile('guide/intro.md')
    createFile('guide/drafts/wip.md')
    createFile('api/reference.md')

    const result = discoverPages(tmpDir, ['guide/**/*.md'], ['**/drafts/**'])

    expect(result).toEqual([file1])
  })

  it('ignores non-markdown files', () => {
    const mdFile = createFile('index.md')
    createFile('styles.css')
    createFile('script.ts')
    createFile('data.json')
    createFile('readme.txt')

    const result = discoverPages(tmpDir, ['**/*'], [])

    expect(result).toEqual([mdFile])
  })

  it('ignores dotfiles and hidden directories', () => {
    const mdFile = createFile('visible.md')
    createFile('.hidden.md')
    createFile('.secret/page.md')

    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result).toEqual([mdFile])
  })

  it('ignores skipped directories (node_modules, .git, .vitepress)', () => {
    const mdFile = createFile('index.md')
    createFile('node_modules/pkg/README.md')
    createFile('.git/description.md')
    createFile('.vitepress/config.md')

    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result).toEqual([mdFile])
  })

  it('returns an empty array when srcDir does not exist', () => {
    const nonExistent = join(tmpDir, 'does-not-exist')
    const result = discoverPages(nonExistent, ['**/*.md'], [])

    expect(result).toEqual([])
  })

  it('returns an empty array when srcDir is empty', () => {
    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result).toEqual([])
  })

  it('returns an empty array when srcDir has no markdown files', () => {
    createFile('config.json')
    createFile('style.css')

    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result).toEqual([])
  })

  it('handles deeply nested directories correctly', () => {
    const deepFile = createFile('a/b/c/d/e/f/nested.md')

    const result = discoverPages(tmpDir, ['**/*.md'], [])

    expect(result).toEqual([deepFile])
  })
})

describe('pagePathOf', () => {
  const srcDir = '/app/docs'

  it('converts root index.md to "/"', () => {
    expect(pagePathOf(srcDir, '/app/docs/index.md')).toBe('/')
  })

  it('converts root markdown file to "/<filename>"', () => {
    expect(pagePathOf(srcDir, '/app/docs/about.md')).toBe('/about')
  })

  it('converts nested markdown file to "/<dir>/<filename>"', () => {
    expect(pagePathOf(srcDir, '/app/docs/guide/getting-started.md')).toBe('/guide/getting-started')
  })

  it('converts nested index.md to "/<dir>/index"', () => {
    expect(pagePathOf(srcDir, '/app/docs/guide/index.md')).toBe('/guide/index')
  })

  it('handles deeply nested paths', () => {
    expect(pagePathOf(srcDir, '/app/docs/api/v1/auth/tokens.md')).toBe('/api/v1/auth/tokens')
  })
})
