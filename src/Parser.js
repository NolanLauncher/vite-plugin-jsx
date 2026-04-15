export default class Parser {
  constructor(src, opts) {
    this.src = src
    this.pos = 0
    this.pragma = opts.pragma
    this.pragmaFrag = opts.pragmaFrag
    this.out = ''
  }

  ch(offset = 0)  { return this.src[this.pos + offset] }
  peek(s)         { return this.src.startsWith(s, this.pos) }
  advance(n = 1)  { const s = this.src.slice(this.pos, this.pos + n); this.pos += n; return s }
  emit(s)         { this.out += s }

  readWhile(fn) {
    let s = ''
    while (this.pos < this.src.length && fn(this.src[this.pos])) s += this.advance()
    return s
  }

  skipString(q) {
    this.emit(this.advance()) // opening quote
    while (this.pos < this.src.length) {
      const c = this.advance()
      this.emit(c)
      if (c === '\\') { this.emit(this.advance()); continue }
      if (q === '`' && c === '$' && this.ch() === '{') {
        this.emit(this.advance()) // {
        this.skipBalanced('{', '}', true)
        continue
      }
      if (c === q) break
    }
  }

  skipLineComment() {
    while (this.pos < this.src.length && this.ch() !== '\n') this.emit(this.advance())
  }

  skipBlockComment() {
    while (this.pos < this.src.length) {
      if (this.peek('*/')) { this.emit(this.advance(2)); return }
      this.emit(this.advance())
    }
  }

  skipRegex() {
    this.emit(this.advance()) // opening /
    let inClass = false
    while (this.pos < this.src.length) {
      const c = this.advance()
      this.emit(c)
      if (c === '\\') { this.emit(this.advance()); continue }
      if (c === '[') { inClass = true; continue }
      if (c === ']') { inClass = false; continue }
      if (c === '/' && !inClass) break
    }
    // flags
    this.emit(this.readWhile(c => /[gimsuy]/.test(c)))
  }

  skipBalanced(open, close, isTemplate = false) {
    let depth = 1
    while (this.pos < this.src.length) {
      const c = this.ch()
      if (c === '"' || c === "'" || c === '`') { this.skipString(c); continue }
      if (c === '/' && this.ch(1) === '/') { this.emit(this.advance(2)); this.skipLineComment(); continue }
      if (c === '/' && this.ch(1) === '*') { this.emit(this.advance(2)); this.skipBlockComment(); continue }
      if (c === open)  { depth++; this.emit(this.advance()); continue }
      if (c === close) {
        depth--
        if (depth === 0) { this.emit(this.advance()); return }
        this.emit(this.advance()); continue
      }
      if (this.isJSXStart()) {
        this.emit(this.parseJSX())
        continue
      }
      this.emit(this.advance())
    }
  }

  isJSXStart() {
    if (this.ch() !== '<') return false

    // <> fragment
    if (this.ch(1) === '>') return true

    // </> or </Tag>
    if (this.ch(1) === '/') return false

    // <Tag or <tag
    if (!/[A-Za-z_$]/.test(this.ch(1))) return false

    const before = this.out.trimEnd()
    const lastChar = before[before.length - 1]
    return !lastChar || /[=(\[{,;:!&|?~^+\-*%>]/.test(lastChar) || before.endsWith('return')
  }

  parseJSX() {
    // Fragment <>...</>
    if (this.peek('<>')) {
      this.advance(2)
      const children = this.parseChildren(null)
      return `${this.pragma}(${this.pragmaFrag}, null${children})`
    }

    // <Tag ...
    this.advance() // <
    const name = this.readName()
    if (!name) return '<'

    const tag = /^[a-z]/.test(name) ? JSON.stringify(name) : name

    // Attributes
    let props = null
    const attrParts = []
    let hasSpreads = false

    while (this.pos < this.src.length) {
      this.skipWS()
      if (this.peek('/>') || this.ch() === '>') break

      // Spread attr {...expr}
      if (this.peek('{...')) {
        this.advance(4)
        const expr = this.readJSExpr()
        attrParts.push({ spread: true, value: expr })
        hasSpreads = true
        continue
      }

      const attrName = this.readAttrName()
      if (!attrName) { this.advance(); continue }

      this.skipWS()
      if (this.ch() === '=') {
        this.advance() // =
        this.skipWS()
        const val = this.readAttrValue()
        attrParts.push({ key: attrName, value: val })
      } else {
        attrParts.push({ key: attrName, value: 'true' })
      }
    }

    props = this.buildProps(attrParts, hasSpreads)

    // Self-closing
    if (this.peek('/>')) {
      this.advance(2)
      return `${this.pragma}(${tag}, ${props})`
    }

    // >
    if (this.ch() === '>') this.advance()

    const children = this.parseChildren(name)
    return `${this.pragma}(${tag}, ${props}${children})`
  }

  parseChildren(tagName) {
    let result = ''

    while (this.pos < this.src.length) {
      // Closing fragment </>
      if (tagName === null && this.peek('</>')) {
        this.advance(3)
        break
      }
      // Closing tag </TagName>
      if (tagName !== null && this.peek(`</${tagName}`)) {
        this.advance(2 + tagName.length)
        this.skipWS()
        if (this.ch() === '>') this.advance()
        break
      }
      if (this.isJSXStart()) {
        result += `, ${this.parseJSX()}`
        continue
      }
      // Fragment child
      if (this.peek('<>')) {
        const frag = this.parseJSX()
        result += `, ${frag}`
        continue
      }
      // JS expression child {expr}
      if (this.ch() === '{') {
        this.advance()
        const expr = this.readJSExpr()
        const trimmed = expr.trim()
        if (trimmed) result += `, ${trimmed}`
        continue
      }
      // Text content
      const text = this.readTextContent()
      if (text) result += `, ${JSON.stringify(text)}`
    }

    return result
  }

  skipWS() { this.readWhile(c => /[ \t\r\n]/.test(c)) }

  readName() {
    return this.readWhile(c => /[\w\-\.]/.test(c))
  }

  readAttrName() {
    return this.readWhile(c => /[\w\-\.\:]/.test(c))
  }

  readAttrValue() {
    const q = this.ch()
    if (q === '"' || q === "'") {
      this.advance()
      let v = ''
      while (this.pos < this.src.length && this.ch() !== q) v += this.advance()
      this.advance() // closing quote
      return JSON.stringify(v)
    }
    if (q === '{') {
      this.advance()
      return this.readJSExpr()
    }
    return 'true'
  }

  readJSExpr() {
    let depth = 1, s = '', inStr = null
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]
      if (inStr) {
        s += this.advance()
        if (s[s.length - 1] === '\\') s += this.advance()
        else if (s[s.length - 1] === inStr) inStr = null
      } else if (c === '"' || c === "'" || c === '`') {
        inStr = c; s += this.advance()
      } else if (c === '{') { depth++; s += this.advance() }
      else if (c === '}') {
        depth--
        if (depth === 0) { this.advance(); break }
        s += this.advance()
      } else {
        s += this.advance()
      }
    }
    return s
  }

  readTextContent() {
    let s = ''
    while (this.pos < this.src.length) {
      if (this.ch() === '<' || this.ch() === '{') break
      s += this.advance()
    }
    return s.replace(/\s+/g, ' ').trim()
  }

  buildProps(parts, hasSpreads) {
    if (parts.length === 0) return 'null'
    if (!hasSpreads) {
      const entries = parts.map(p => {
        const key = p.key.replace(/^on([a-z])/, (_, c) => 'on' + c.toUpperCase())
        return `${JSON.stringify(key)}: ${p.value}`
      })
      return `{ ${entries.join(', ')} }`
    }
    const chunks = parts.map(p =>
      p.spread ? p.value : `{ ${JSON.stringify(p.key)}: ${p.value} }`
    )
    return `Object.assign({}, ${chunks.join(', ')})`
  }

  parse() {
    while (this.pos < this.src.length) {
      const c = this.ch()

      // Strings
      if (c === '"' || c === "'" || c === '`') { this.skipString(c); continue }

      // Comments
      if (c === '/' && this.ch(1) === '/') { this.emit(this.advance(2)); this.skipLineComment(); continue }
      if (c === '/' && this.ch(1) === '*') { this.emit(this.advance(2)); this.skipBlockComment(); continue }

      // JSX
      if (this.isJSXStart() || this.peek('<>')) {
        this.emit(this.parseJSX())
        continue
      }

      this.emit(this.advance())
    }
    return this.out
  }
}
