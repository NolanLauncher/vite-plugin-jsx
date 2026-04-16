import Parser from "./Parser.js";

const PACKAGE_NAME = '@NolanLauncher/vite-plugin-jsx'

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

  const autoImport = `import { ${pragma}, ${pragmaFrag}, signal, computed, effect, mount } from '${PACKAGE_NAME}';\n`

  return {
    name: 'vite-plugin-jsx',

    transform(code, id) {
      const clean = id.split('?')[0]
      if (exclude && matchesFilter(exclude, clean)) return null
      if (!matchesFilter(include, clean)) return null

      const result = transformJSX(code, { pragma, pragmaFrag })
      if (result === code) return null

      const alreadyImported = code.includes(`from '${PACKAGE_NAME}'`) || code.includes(`from "${PACKAGE_NAME}"`)
      const final = alreadyImported ? result : autoImport + result

      console.log(final)

      return { code: final, map: null }
    },
  }
}

export * from './runtime.js'