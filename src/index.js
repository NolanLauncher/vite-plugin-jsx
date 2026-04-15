import Parser from "./Parser.js";

function transformJSX(code, opts) {
  if (!code.includes('<')) return code
  return new Parser(code, opts).parse()
}

function matchesFilter(filter, id) {
  if (!filter) return false
  if (Array.isArray(filter)) return filter.some(f => matchesFilter(f, id))
  if (filter instanceof RegExp) return filter.test(id)
  return id.includes(filter)
}

export default function jsxPlugin(opts = {}) {
  const {
    pragma     = 'h',
    pragmaFrag = 'Fragment',
    include    = /\.[jt]sx?$/,
    exclude    = /node_modules/,
  } = opts

  return {
    name: 'vite-plugin-jsx',

    transform(code, id) {
      const clean = id.split('?')[0]
      if (exclude && matchesFilter(exclude, clean)) return null
      if (!matchesFilter(include, clean)) return null

      const result = transformJSX(code, { pragma, pragmaFrag })
      if (result === code) return null

      return { code: result, map: null }
    },
  }
}

export * from "./runtime.js";