import { HyphenationRuntimeOptions } from '../src/client/hyphenationRuntime'
import { hyphenateText } from '../src/index'

const SKIP_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'script',
  'style',
  'textarea',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  '.header-anchor',
  '.vp-nolex',
  '[data-no-hyphen]',
  '[data-idn-hyphenated]',
].join(',')

class MockElement {
  tagName: string
  parentElement: MockElement | null
  className: string
  attributes: Record<string, string>
  children: MockElement[]
  childNodes: (MockElement | MockTextNode)[]
  ownerDocument: MockDocument | null
  nodeType: number

  constructor(tagName: string, parent: MockElement | null = null, className = '', attributes: Record<string, string> = {}) {
    this.nodeType = 1 // ELEMENT_NODE
    this.tagName = tagName.toUpperCase()
    this.parentElement = parent
    this.className = className
    this.attributes = attributes
    this.children = []
    this.childNodes = []
    this.ownerDocument = null
  }

  getAttribute(attr: string) {
    return this.attributes[attr] || null
  }

  setAttribute(attr: string, val: any) {
    this.attributes[attr] = String(val)
  }

  removeAttribute(attr: string) {
    delete this.attributes[attr]
  }

  appendChild<T extends MockElement | MockTextNode>(child: T): T {
    child.parentElement = this
    if (child.nodeType === 1) {
      this.children.push(child as MockElement)
    }
    this.childNodes.push(child)
    if (this.ownerDocument) {
      if ('setOwnerDocument' in child) {
        (child as MockElement).setOwnerDocument(this.ownerDocument)
      } else {
        child.ownerDocument = this.ownerDocument
      }
    }
    return child
  }

  setOwnerDocument(doc: MockDocument) {
    this.ownerDocument = doc
    for (const child of this.childNodes) {
      if ('setOwnerDocument' in child) {
        (child as MockElement).setOwnerDocument(doc)
      } else {
        child.ownerDocument = doc
      }
    }
  }

  matches(selector: string): boolean {
    const selectors = selector.split(',')
    for (let sel of selectors) {
      sel = sel.trim()
      if (sel.startsWith('.')) {
        if (this.className.split(/\s+/).includes(sel.slice(1))) return true
      } else if (sel.startsWith('[')) {
        const attrName = sel.replace(/[[\]]/g, '')
        if (this.attributes[attrName] !== undefined) return true
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
      if (curr.matches && curr.matches(selector)) return curr
      curr = curr.parentElement
    }
    return null
  }
}

class MockTextNode {
  nodeType: number
  nodeValue: string
  parentElement: MockElement | null
  ownerDocument: MockDocument | null

  constructor(nodeValue: string, parent: MockElement | null = null) {
    this.nodeType = 3 // TEXT_NODE
    this.nodeValue = nodeValue
    this.parentElement = parent
    this.ownerDocument = null
  }
}

class MockDocument {
  createTreeWalker(root: MockElement, whatToShow: number, filter?: NodeFilter | ((node: any) => number) | null) {
    const nodes: (MockTextNode | MockElement)[] = []
    const filterObj = typeof filter === 'function' ? { acceptNode: filter } : filter

    function collect(node: MockElement | MockTextNode) {
      let acceptResult = 1 // SHOW_ALL default accept
      if (filterObj && filterObj.acceptNode) {
        acceptResult = filterObj.acceptNode(node as any)
      }

      if (acceptResult === 2 /* NodeFilter.FILTER_REJECT */) {
        return // REJECT node and its children
      }

      if (acceptResult === 1 /* NodeFilter.FILTER_ACCEPT */) {
        // Accept matching nodeType
        if ((whatToShow & (1 << (node.nodeType - 1))) !== 0) {
          nodes.push(node)
        }
      }

      // Traversal continues to children if not REJECT
      if (node.nodeType === 1) {
        for (const child of (node as MockElement).childNodes) {
          collect(child)
        }
      }
    }

    collect(root)

    let idx = -1
    return {
      nextNode() {
        idx++
        return idx < nodes.length ? nodes[idx] : null
      }
    }
  }
}

// ORIGINAL IMPLEMENTATION
function canProcessOriginal(node: any): boolean {
  const parent = node.parentElement
  if (!parent) return false
  if (parent.closest(SKIP_SELECTOR)) return false
  return /\p{L}{2,}/u.test(node.nodeValue ?? '')
}

function hyphenateContainerOriginal(root: any, options: HyphenationRuntimeOptions): boolean {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  let changed = false
  let node = walker.nextNode()
  while (node) {
    const next = walker.nextNode()
    if (canProcessOriginal(node)) {
      const before = node.nodeValue ?? ''
      const after = hyphenateText(before, {
        language: options.language,
        minWordLength: options.minWordLength,
      })
      if (after !== before) {
        node.nodeValue = after
        changed = true
      }
    }
    node = next
  }
  return changed
}

// OPTIMIZED IMPLEMENTATION
function hyphenateContainerOptimized(root: any, options: HyphenationRuntimeOptions): boolean {
  const doc = root.ownerDocument
  const filter = {
    acceptNode(node: any) {
      if (node.nodeType === 1 /* ELEMENT_NODE */) {
        if (node.matches(SKIP_SELECTOR)) {
          return 2 /* NodeFilter.FILTER_REJECT */
        }
        return 3 /* NodeFilter.FILTER_SKIP */
      }
      if (node.nodeType === 3 /* TEXT_NODE */) {
        if (/\p{L}{2,}/u.test(node.nodeValue ?? '')) {
          return 1 /* NodeFilter.FILTER_ACCEPT */
        }
      }
      return 3 /* NodeFilter.FILTER_SKIP */
    }
  }

  const walker = doc.createTreeWalker(
    root,
    5, /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT */
    filter
  )

  let changed = false
  let node = walker.nextNode()
  while (node) {
    const before = node.nodeValue ?? ''
    const after = hyphenateText(before, {
      language: options.language,
      minWordLength: options.minWordLength,
    })
    if (after !== before) {
      node.nodeValue = after
      changed = true
    }
    node = walker.nextNode()
  }
  return changed
}

const doc = new MockDocument()
const options: HyphenationRuntimeOptions = {
  language: 'id',
  minWordLength: 4,
  selector: '.vp-doc'
}

function buildTree(depth: number, breadth: number) {
  const root = new MockElement('div', null, 'vp-doc')
  root.setOwnerDocument(doc)

  function createSubtree(currDepth: number, parent: MockElement): MockElement {
    const el = new MockElement('div', parent)
    if (currDepth === depth) {
      for (let i = 0; i < 10; i++) {
        const p = new MockElement('p', el)
        p.appendChild(new MockTextNode('Pemerintahan kebudayaan kebangsaan pertanggungjawaban keterbukaan', p))
        el.appendChild(p)

        const code = new MockElement('code', el)
        code.appendChild(new MockTextNode('const foo = "pemerintahan kebudayaan";', code))
        el.appendChild(code)

        const link = new MockElement('a', el)
        link.appendChild(new MockTextNode('Pemerintahan kebudayaan link text', link))
        el.appendChild(link)
      }
      return el
    }
    for (let i = 0; i < breadth; i++) {
      el.appendChild(createSubtree(currDepth + 1, el))
    }
    return el
  }

  root.appendChild(createSubtree(1, root))
  return root
}

const rootsOriginal: MockElement[] = []
const rootsOptimized: MockElement[] = []
for (let i = 0; i < 20; i++) {
  rootsOriginal.push(buildTree(4, 3))
  rootsOptimized.push(buildTree(4, 3))
}

const runs = 100

console.log('Testing Original...')
const startOriginal = performance.now()
for (let r = 0; r < runs; r++) {
  for (const root of rootsOriginal) {
    hyphenateContainerOriginal(root, options)
  }
}
const timeOriginal = performance.now() - startOriginal

console.log('Testing Optimized...')
const startOptimized = performance.now()
for (let r = 0; r < runs; r++) {
  for (const root of rootsOptimized) {
    hyphenateContainerOptimized(root, options)
  }
}
const timeOptimized = performance.now() - startOptimized

console.log(`Original: ${timeOriginal.toFixed(2)} ms (${(timeOriginal/runs).toFixed(2)} ms/run)`)
console.log(`Optimized: ${timeOptimized.toFixed(2)} ms (${(timeOptimized/runs).toFixed(2)} ms/run)`)
console.log(`Improvement: ${(((timeOriginal - timeOptimized) / timeOriginal) * 100).toFixed(2)}% faster`)
