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

  it('handles non-existent include file gracefully (returns original include comment)', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = 'Before\n<!-- @include: ./non-existent.md -->\nAfter'

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe(srcContent)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('logs warning when DEBUG env variable is set and include file fails to read', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = '<!-- @include: ./missing.md -->'

    const originalDebug = process.env.DEBUG
    process.env.DEBUG = '1'

    try {
      const result = await expandIncludes(tmpDir, srcContent, srcFile)
      expect(result).toBe(srcContent)
    } finally {
      if (originalDebug !== undefined) {
        process.env.DEBUG = originalDebug
      } else {
        delete process.env.DEBUG
      }
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('expands @srcDir relative includes with and without leading slash', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    const subDir = join(tmpDir, 'sub')
    mkdirSync(subDir, { recursive: true })

    const file1 = join(subDir, 'file1.md')
    const file2 = join(subDir, 'file2.md')
    writeFileSync(file1, 'Content 1', 'utf8')
    writeFileSync(file2, 'Content 2', 'utf8')

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = '<!-- @include: @/sub/file1.md --> and <!-- @include: @sub/file2.md -->'

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe('Content 1 and Content 2')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handles range meta filtering {start,end}, {start,}, {,end}', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const snippetFile = join(tmpDir, 'lines.txt')
    const fileContent = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].join('\n')
    writeFileSync(snippetFile, fileContent, 'utf8')

    const srcFile = join(tmpDir, 'index.md')

    const resRange = await expandIncludes(tmpDir, '<!-- @include: ./lines.txt{2,4} -->', srcFile)
    expect(resRange).toBe('Line 2\nLine 3\nLine 4')

    const resStartOnly = await expandIncludes(tmpDir, '<!-- @include: ./lines.txt{3,} -->', srcFile)
    expect(resStartOnly).toBe('Line 3\nLine 4\nLine 5')

    const resEndOnly = await expandIncludes(tmpDir, '<!-- @include: ./lines.txt{,2} -->', srcFile)
    expect(resEndOnly).toBe('Line 1\nLine 2')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('strips frontmatter for included .md files without meta and preserves it when meta is present', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const mdFile = join(tmpDir, 'included.md')
    const mdContent = '---\ntitle: Inc\n---\nIncluded Body'
    writeFileSync(mdFile, mdContent, 'utf8')

    const srcFile = join(tmpDir, 'index.md')

    const resNoMeta = await expandIncludes(tmpDir, '<!-- @include: ./included.md -->', srcFile)
    expect(resNoMeta).toBe('Included Body')

    const resWithRange = await expandIncludes(tmpDir, '<!-- @include: ./included.md{1,2} -->', srcFile)
    expect(resWithRange).toBe('---\ntitle: Inc')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('tracks dependencies across nested and recursive includes in deps set', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const fileA = join(tmpDir, 'a.md')
    const fileB = join(tmpDir, 'b.md')

    writeFileSync(fileA, 'A: <!-- @include: ./b.md -->', 'utf8')
    writeFileSync(fileB, 'B Content', 'utf8')

    const srcFile = join(tmpDir, 'index.md')
    const deps = new Set<string>()

    const result = await expandIncludes(tmpDir, '<!-- @include: ./a.md -->', srcFile, deps)

    expect(result).toBe('A: B Content')
    expect(deps.has(fileA)).toBe(true)
    expect(deps.has(fileB)).toBe(true)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handles empty or blank include directives gracefully', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = 'Empty: <!-- @include: -->'

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe(srcContent)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('expands multiple includes in a single document in correct order', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const part1 = join(tmpDir, 'part1.md')
    const part2 = join(tmpDir, 'part2.md')

    writeFileSync(part1, 'First', 'utf8')
    writeFileSync(part2, 'Second', 'utf8')

    const srcFile = join(tmpDir, 'index.md')
    const srcContent = 'Part 1: <!-- @include: ./part1.md --> | Part 2: <!-- @include: ./part2.md -->'

    const result = await expandIncludes(tmpDir, srcContent, srcFile)
    expect(result).toBe('Part 1: First | Part 2: Second')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('supports alternative region comment markers', async () => {
    const tmpDir = join(tmpdir(), 'test_markdown_' + Date.now())
    mkdirSync(tmpDir, { recursive: true })

    const cLikeFile = join(tmpDir, 'code.c')
    const cLikeContent = '/* #region c-block */\nint x = 10;\n/* #endregion c-block */'
    writeFileSync(cLikeFile, cLikeContent, 'utf8')

    const htmlFile = join(tmpDir, 'code.html')
    const htmlContent = '<!-- #region html-block -->\n<div>Hello</div>\n<!-- #endregion html-block -->'
    writeFileSync(htmlFile, htmlContent, 'utf8')

    const srcFile = join(tmpDir, 'index.md')

    const resC = await expandIncludes(tmpDir, '<!-- @include: ./code.c#c-block -->', srcFile)
    expect(resC).toBe('int x = 10;')

    const resHtml = await expandIncludes(tmpDir, '<!-- @include: ./code.html#html-block -->', srcFile)
    expect(resHtml).toBe('<div>Hello</div>')

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
