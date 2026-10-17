import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { expandIncludes, stripFrontmatter } from '../../src/node/markdown'

describe('stripFrontmatter', () => {
  it('removes standard YAML frontmatter with LF newlines', () => {
    const input = '---\ntitle: Hello World\ndescription: Test page\n---\n# Main Heading\nSome content'
    const expected = '# Main Heading\nSome content'
    expect(stripFrontmatter(input)).toBe(expected)
  })

  it('removes YAML frontmatter with CRLF newlines', () => {
    const input = '---\r\ntitle: Hello World\r\ndescription: Test page\r\n---\r\n# Main Heading\r\nSome content'
    const expected = '# Main Heading\r\nSome content'
    expect(stripFrontmatter(input)).toBe(expected)
  })

  it('returns unchanged string if there is no frontmatter', () => {
    const input = '# Main Heading\nSome content\n---\nHorizontal line'
    expect(stripFrontmatter(input)).toBe(input)
  })

  it('returns empty string if content consists solely of frontmatter', () => {
    const input = '---\ntitle: Hello\n---'
    expect(stripFrontmatter(input)).toBe('')
  })

  it('preserves horizontal rules later in document', () => {
    const input = '---\ntitle: Test\n---\nParagraph 1\n\n---\n\nParagraph 2'
    const expected = 'Paragraph 1\n\n---\n\nParagraph 2'
    expect(stripFrontmatter(input)).toBe(expected)
  })

  it('does not strip unclosed frontmatter block', () => {
    const input = '---\ntitle: Test without closing'
    expect(stripFrontmatter(input)).toBe(input)
  })

  it('handles empty input string', () => {
    expect(stripFrontmatter('')).toBe('')
  })
})

describe('expandIncludes', () => {
  it('expands region includes correctly', async () => {
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

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe('const b = 2;\nconst c = 3;')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handles non-existent region gracefully (slice(undefined, undefined) returns all lines)', async () => {
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

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe(fileContent)

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
