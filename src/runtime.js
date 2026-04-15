let currentEffect = null

export function signal(initial) {
  let _value = initial
  const subs = new Set()

  return {
    get value() {
      if (currentEffect) subs.add(currentEffect)
      return _value
    },
    set value(v) {
      if (v === _value) return
      _value = v
      for (const fn of [...subs]) fn()
    },
    _subscribe(fn) { subs.add(fn) },
    _unsubscribe(fn) { subs.delete(fn) },
  }
}

export function computed(fn) {
  const s = signal(undefined)
  effect(() => { s.value = fn() })
  return { get value() { return s.value } }
}

export function effect(fn) {
  let cleanup = null

  const run = () => {
    if (cleanup) { cleanup(); cleanup = null }
    const prev = currentEffect
    currentEffect = run
    cleanup = fn() ?? null
    currentEffect = prev
  }

  run()
  return () => { if (cleanup) cleanup() }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg','path','circle','rect','line','polyline','polygon','ellipse',
  'g','defs','use','symbol','clipPath','mask','pattern','image',
  'text','tspan','textPath','linearGradient','radialGradient','stop',
  'filter','feBlend','feColorMatrix','feMerge','feMergeNode',
])

function createEl(tag) {
  return SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag)
}

function applyProp(el, key, value) {
  if (key === 'ref') {
    if (typeof value === 'function') value(el)
    else if (value && 'value' in value) value.value = el
    return
  }

  if (key === 'style' && typeof value === 'object') {
    const apply = (styles) => {
      if (typeof styles === 'string') { el.style.cssText = styles; return }
      for (const [k, v] of Object.entries(styles)) {
        el.style[k] = typeof v === 'function' ? v() : (v?.value ?? v)
      }
    }
    if (typeof value === 'function') {
      effect(() => apply(value()))
    } else {
      apply(value)
    }
    return
  }

  if (key === 'class' || key === 'className') {
    if (typeof value === 'function') {
      effect(() => { el.className = value() ?? '' })
    } else if (value?.value !== undefined) {
      effect(() => { el.className = value.value ?? '' })
    } else {
      el.className = value ?? ''
    }
    return
  }

  if (/^on[A-Z]/.test(key)) {
    const event = key[2].toLowerCase() + key.slice(3)
    el.addEventListener(event, value)
    return
  }

  if (typeof value === 'function') {
    effect(() => setProp(el, key, value()))
    return
  }
  if (value !== null && typeof value === 'object' && 'value' in value) {
    effect(() => setProp(el, key, value.value))
    return
  }

  setProp(el, key, value)
}

function setProp(el, key, value) {
  if (value === null || value === undefined || value === false) {
    el.removeAttribute(key)
  } else if (key in el && typeof el[key] !== 'undefined' && !SVG_TAGS.has(el.tagName?.toLowerCase())) {
    try { el[key] = value } catch { el.setAttribute(key, value) }
  } else {
    el.setAttribute(key, value === true ? '' : value)
  }
}

function resolveChild(child) {
  if (child === null || child === undefined || child === false) return null
  if (child instanceof Node) return child
  return document.createTextNode(String(child))
}

function mountChild(parent, child, anchor = null) {
  if (typeof child === 'function' || (child !== null && typeof child === 'object' && 'value' in child && !(child instanceof Node))) {
    const getter = typeof child === 'function' ? child : () => child.value

    const marker = document.createTextNode('')
    parent.insertBefore(marker, anchor)

    let nodes = []

    effect(() => {
      const val = getter()
      const newNodes = Array.isArray(val)
        ? val.map(resolveChild).filter(Boolean)
        : [resolveChild(val)].filter(Boolean)

      for (const n of nodes) n.remove()
      nodes = newNodes
      for (const n of newNodes) parent.insertBefore(n, marker)
    })
    return
  }

  if (Array.isArray(child)) {
    for (const c of child) mountChild(parent, c, anchor)
    return
  }

  const node = resolveChild(child)
  if (node) parent.insertBefore(node, anchor)
}

export function h(tag, props, ...children) {
  if (typeof tag === 'function') {
    const p = { ...(props ?? {}), children: children.length === 1 ? children[0] : children }
    return tag(p)
  }

  const el = createEl(tag)
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      applyProp(el, key, value)
    }
  }

  for (const child of children) {
    mountChild(el, child)
  }
  return el
}

export function Fragment({ children }) {
  const frag = document.createDocumentFragment()
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) mountChild(frag, child)
  return frag
}

export function mount(container, component) {
  const result = typeof component === 'function' ? component() : component
  if (result instanceof Node) container.appendChild(result)
}
