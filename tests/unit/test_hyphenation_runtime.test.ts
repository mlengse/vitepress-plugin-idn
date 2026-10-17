import { describe, expect, it } from 'vitest'
import { applyHyphenation, HyphenationRuntimeOptions } from '../../src/client/hyphenationRuntime'
import { SOFT_HYPHEN } from '../../src/core/hyphenate'

class MockElement {
  nodeType = 1
  tagName: string
  className: string
  attributes: Record<string, string>
  parentElement: MockElement | null
  childNodes: (MockElement | MockTextNode)[]
  ownerDocument: any

  constructor(tagName: string, parent: MockElement | null = null, className = '', attributes: Record<string, string> = {}) {
    this.tagName = tagName.toUpperCase()
    this.parentElement = parent
    this.className = className
    this.attributes = attributes
    this.childNodes = []
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val
  }

  matches(selector: string) {
    const parts = selector.split(',')
    for (let sel of parts) {
      sel = sel.trim()
      if (sel.startsWith('.')) {
        if (this.className.split(/\s+/).includes(sel.slice(1))) return true
      } else if (sel.startsWith('[')) {
        const attr = sel.replace(/[[\]]/g, '')
        if (this.attributes[attr] !== undefined) return true
      } else {
        if (this.tagName === sel.toUpperCase()) return true
      }
    }
    return false
  }

  closest(selector: string): MockElement | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curr: MockElement | null = this
    while (curr) {
      if (curr.matches(selector)) return curr
      curr = curr.parentElement
    }
    return null
  }

  appendChild(child: any) {
    child.parentElement = this
    this.childNodes.push(child)
    if (this.ownerDocument) child.ownerDocument = this.ownerDocument
    return child
  }
}

class MockTextNode {
  nodeType = 3
  nodeValue: string
  parentElement: MockElement | null
  ownerDocument: any

  constructor(text: string, parent: MockElement | null = null) {
    this.nodeValue = text
    this.parentElement = parent
  }
}

class MockDocument {
  createTreeWalker(root: MockElement, whatToShow: number, filter?: any) {
    const acceptedNodes: MockTextNode[] = []
    function collect(node: any) {
      if (filter && filter.acceptNode) {
        const res = filter.acceptNode(node)
        if (res === 2 /* FILTER_REJECT */) return
      }
      if (node.nodeType === 3) {
        acceptedNodes.push(node)
      } else if (node.nodeType === 1) {
        for (const child of node.childNodes) {
          collect(child)
        }
      }
    }
    collect(root)
    let index = -1
    return {
      nextNode() {
        index++
        return index < acceptedNodes.length ? acceptedNodes[index] : null
      }
    }
  }
}

describe('hyphenationRuntime', () => {
  it('skips elements matching SKIP_SELECTOR and processes normal text nodes', () => {
    const doc = new MockDocument()
    const root = new MockElement('div', null, 'vp-doc')
    root.ownerDocument = doc

    const p = new MockElement('p', root)
    root.appendChild(p)

    const text1 = new MockTextNode('pemerintahan', p)
    p.appendChild(text1)

    const code = new MockElement('code', p)
    p.appendChild(code)

    const codeText = new MockTextNode('kebudayaan', code)
    code.appendChild(codeText)

    const link = new MockElement('a', root)
    root.appendChild(link)

    const linkText = new MockTextNode('pertanggungjawaban', link)
    link.appendChild(linkText)

    const optOut = new MockElement('div', root, '', { 'data-no-hyphen': 'true' })
    root.appendChild(optOut)

    const optOutText = new MockTextNode('kebangsaan', optOut)
    optOut.appendChild(optOutText)

    ;(global as any).document = {
      querySelectorAll(sel: string) {
        if (sel === '.vp-doc') return [root]
        return []
      }
    }

    const options: HyphenationRuntimeOptions = {
      language: 'id',
      minWordLength: 4,
      selector: '.vp-doc',
    }

    const processed = applyHyphenation(options)
    expect(processed).toBe(1)

    // Paragraph text node should be hyphenated
    expect(text1.nodeValue).toContain(SOFT_HYPHEN)

    // Code and link and opt-out text nodes must NOT be hyphenated
    expect(codeText.nodeValue).toBe('kebudayaan')
    expect(linkText.nodeValue).toBe('pertanggungjawaban')
    expect(optOutText.nodeValue).toBe('kebangsaan')
  })

  it('skips already processed containers marked with data-idn-hyphenated="true"', () => {
    const doc = new MockDocument()
    const root = new MockElement('div', null, 'vp-doc', { 'data-idn-hyphenated': 'true' })
    root.ownerDocument = doc

    const p = new MockElement('p', root)
    root.appendChild(p)

    const textNode = new MockTextNode('pemerintahan', p)
    p.appendChild(textNode)

    ;(global as any).document = {
      querySelectorAll(sel: string) {
        if (sel === '.vp-doc') return [root]
        return []
      }
    }

    const options: HyphenationRuntimeOptions = {
      language: 'id',
      minWordLength: 4,
      selector: '.vp-doc',
    }

    const processed = applyHyphenation(options)
    expect(processed).toBe(0)
    // Content should remain untouched
    expect(textNode.nodeValue).toBe('pemerintahan')
  })

  it('is idempotent on subsequent calls', () => {
    const doc = new MockDocument()
    const root = new MockElement('div', null, 'vp-doc')
    root.ownerDocument = doc

    const p = new MockElement('p', root)
    root.appendChild(p)

    const textNode = new MockTextNode('pemerintahan', p)
    p.appendChild(textNode)

    ;(global as any).document = {
      querySelectorAll(sel: string) {
        if (sel === '.vp-doc') return [root]
        return []
      }
    }

    const options: HyphenationRuntimeOptions = {
      language: 'id',
      minWordLength: 4,
      selector: '.vp-doc',
    }

    // First pass processes 1 container and sets data-idn-hyphenated="true"
    const firstRunCount = applyHyphenation(options)
    expect(firstRunCount).toBe(1)
    expect(root.getAttribute('data-idn-hyphenated')).toBe('true')
    const hyphenatedText = textNode.nodeValue

    // Second pass skips already processed container and returns 0
    const secondRunCount = applyHyphenation(options)
    expect(secondRunCount).toBe(0)
    expect(textNode.nodeValue).toBe(hyphenatedText)
  })

  it('skips root elements that match or are inside SKIP_SELECTOR', () => {
    const doc = new MockDocument()
    // Code block container matching selector
    const codeRoot = new MockElement('code', null, 'vp-doc')
    codeRoot.ownerDocument = doc
    const codeText = new MockTextNode('pemerintahan', codeRoot)
    codeRoot.appendChild(codeText)

    // Div inside a pre element
    const preParent = new MockElement('pre', null)
    const childRoot = new MockElement('div', preParent, 'vp-doc')
    childRoot.ownerDocument = doc
    const childText = new MockTextNode('pemerintahan', childRoot)
    childRoot.appendChild(childText)

    ;(global as any).document = {
      querySelectorAll(sel: string) {
        if (sel === '.vp-doc') return [codeRoot, childRoot]
        return []
      }
    }

    const options: HyphenationRuntimeOptions = {
      language: 'id',
      minWordLength: 4,
      selector: '.vp-doc',
    }

    const processed = applyHyphenation(options)
    expect(processed).toBe(0)
    expect(codeText.nodeValue).toBe('pemerintahan')
    expect(childText.nodeValue).toBe('pemerintahan')
  })

  it('returns 0 when document is undefined (SSR environment)', () => {
    const originalDocument = (global as any).document
    try {
      delete (global as any).document

      const options: HyphenationRuntimeOptions = {
        language: 'id',
        minWordLength: 4,
        selector: '.vp-doc',
      }

      const processed = applyHyphenation(options)
      expect(processed).toBe(0)
    } finally {
      ;(global as any).document = originalDocument
    }
  })
})
