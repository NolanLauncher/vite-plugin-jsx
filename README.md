# vite-plugin-jsx

A zero-dependency JSX transform plugin for Vite, built for **NolanLauncher**.

Converts JSX syntax to plain `h()` calls at build time — no Babel, no React, no external runtime required. Pairs with the included `runtime` which provides a lightweight reactive DOM renderer with signals.

---

## Setup

```js
// vite.config.js
import { defineConfig } from 'vite'
import jsxPlugin from '@NolanLauncher/vite-plugin-jsx'

export default defineConfig({
  plugins: [
    jsxPlugin({
      pragma: 'h',
      pragmaFrag: 'Fragment',
    })
  ]
})
```

Import the pragma in any file that uses JSX:

```js
import { h, Fragment } from '@NolanLauncher/vite-plugin-jsx'
```

---

## Plugin options

| Option | Default | Description |
|---|---|---|
| `pragma` | `'h'` | Function called for each JSX element |
| `pragmaFrag` | `'Fragment'` | Identifier used for `<>...</>` fragments |
| `include` | `/\.[jt]sx?$/` | Files to transform (`.js`, `.jsx`, `.ts`, `.tsx`) |
| `exclude` | `/node_modules/` | Files to skip |

---

## Runtime API

### `signal(value)`
A reactive value. Reading `.value` inside an `effect` or JSX expression tracks it as a dependency. Writing `.value` triggers updates.

```js
const count = signal(0)
count.value++
```

### `computed(fn)`
A read-only derived signal. Recomputes automatically when its dependencies change.

```js
const double = computed(() => count.value * 2)
```

### `effect(fn)`
Runs `fn` immediately, then re-runs it whenever any signal read inside changes. Returns a dispose function.

```js
const stop = effect(() => {
  console.log('count is', count.value)
})
stop() // unsubscribe
```

### `h(tag, props, ...children)`
The JSX pragma. Creates real DOM elements or calls component functions. You don't call this directly — the plugin emits it from JSX.

### `Fragment`
Renders children with no wrapper element. Used by `<>...</>`.

### `mount(container, component)`
Mounts a component into a DOM element.

```js
mount(document.getElementById('app'), App)
```

---

## Example

```jsx
import { h, Fragment, signal, computed, mount } from '@NolanLauncher/vite-plugin-jsx'

function Counter() {
  const count = signal(0)
  const label = computed(() => count.value === 1 ? 'click' : 'clicks')

  return (
    <div class="counter">
      <p>{() => count.value} {() => label.value}</p>
      <button onClick={() => count.value++}>+</button>
      <button onClick={() => count.value--}>−</button>
    </div>
  )
}

mount(document.getElementById('app'), Counter)
```

Reactive children must be wrapped in an arrow function or passed as a signal so the runtime knows to track them:

```jsx
// ✅ reactive — updates on change
<p>{() => count.value}</p>

// ❌ static — captured once at render time
<p>{count.value}</p>
```

---

## JSX support

| Syntax | Supported |
|---|---|
| Host elements `<div>` | ✅ |
| Components `<MyComp>` | ✅ |
| Fragments `<>...</>` | ✅ |
| Self-closing `<img />` | ✅ |
| Spread props `{...obj}` | ✅ |
| Boolean attrs `disabled` | ✅ |
| Event handlers `onClick` | ✅ |
| Reactive props / children | ✅ |
| SVG elements | ✅ |
| JSX inside `.js` files | ✅ |
