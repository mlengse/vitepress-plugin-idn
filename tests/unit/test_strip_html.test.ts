import { describe, expect, it } from 'vitest'
import { stripHtml } from '../../src/node/scan'

describe('stripHtml', () => {
  it('returns empty string or trimmed whitespace for empty or blank input', () => {
    expect(stripHtml('')).toBe('')
    expect(stripHtml('   ')).toBe('')
    expect(stripHtml('\n\t  \n ')).toBe('')
  })

  it('normalizes whitespace in plain text without HTML tags', () => {
    expect(stripHtml('Hello World')).toBe('Hello World')
    expect(stripHtml('   Hello   \n\t World   ')).toBe('Hello World')
  })

  it('strips basic HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World')
    expect(stripHtml('<h1>Title</h1><div>Content</div>')).toBe('Title Content')
  })

  it('strips header anchor links along with their inner content', () => {
    expect(stripHtml('<h1>Title <a class="header-anchor" href="#title">#</a></h1>')).toBe('Title')
    expect(
      stripHtml('<h2>Panduan <a class="header-anchor custom-class" href="#panduan">#</a></h2>'),
    ).toBe('Panduan')
  })

  it('strips block tags (script, style, template) but preserves inner non-tag text', () => {
    expect(
      stripHtml('<script>alert(1)</script><style>b{color:red}</style><template>t</template>'),
    ).toBe('alert(1) b{color:red} t')
  })

  it('decodes standard HTML entities', () => {
    expect(stripHtml('Zero&ZeroWidthSpace;Width')).toBe('ZeroWidth')
    expect(stripHtml('Hello&nbsp;World')).toBe('Hello World')
    expect(stripHtml('&lt;div&gt;')).toBe('<div>')
    expect(stripHtml('&quot;Hello&quot;')).toBe('"Hello"')
    expect(stripHtml('&#39;test&#39; and &#x27;test2&#x27;')).toBe("'test' and 'test2'")
    expect(stripHtml('Fish &amp; Chips')).toBe('Fish & Chips')
  })

  it('handles combinations of tags, anchors, entities, and whitespace', () => {
    const input =
      '<h1>Pengenalan &amp; Panduan <a class="header-anchor" href="#pengenalan">#</a></h1>\n' +
      '<p>Ini &nbsp; adalah &lt;contoh&gt; &quot;teks&quot; &#39;test&#39;.</p>'
    expect(stripHtml(input)).toBe('Pengenalan & Panduan Ini adalah <contoh> "teks" \'test\'.')
  })
})
