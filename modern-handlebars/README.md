# @charliewilco/modern-handlebars

A tiny tagged-template helper that turns trusted static HTML and
context-separated dynamic values into a `DocumentFragment`.

```sh
npm install @charliewilco/modern-handlebars
```

```ts
import { hbs } from '@charliewilco/modern-handlebars';

const name = '<Grace>';
const link = document.createElement('a');
link.href = '/users/1';
link.textContent = 'Profile';

const fragment = hbs`
	<section class="user ${'selected'}">
		<h1>${name}</h1>
		${link}
	</section>
`;

document.body.append(fragment);
```

The result contains an `h1` whose text is literally `<Grace>`. Dynamic strings are assigned as
text or attribute values after the static markup is parsed, so they are never reparsed as HTML.

## Values

Child positions accept strings, numbers, bigints, symbols, DOM nodes, document fragments, and
nested iterables of those values. `null`, `undefined`, and booleans render nothing. Nodes are moved,
not cloned.

Attribute positions accept primitives. A full attribute interpolation treats `true` as an empty
boolean attribute and removes the attribute for `false`, `null`, or `undefined`. In mixed attribute
values, nullable and boolean values contribute an empty string.

```ts
const input = hbs`
	<input disabled=${true} hidden=${false} aria-label="User ${name}">
`;
```

Dynamic `on*` event-handler and `srcdoc` attributes throw. Use `addEventListener` after creating
the fragment. Interpolated tag names, attribute names, comments, and raw-text elements such as
`script` and `style` also throw. Static template strings are application source code and must be
trusted; `hbs` is not a general HTML sanitizer and does not validate URL schemes.

## What this is not

Despite the name, this is not compatible with Handlebars. It has no compiler, expressions,
conditionals, loops, helpers, partials, escaping modes, runtime registry, reactivity, or string
rendering. Ordinary JavaScript handles branching and iteration, and the browser owns parsing and
DOM construction.

```ts
const rows = users.map((user) => hbs`<li>${user.name}</li>`);
const list = hbs`<ul>${rows}</ul>`;
```

The complete public API is `hbs`, `TemplatePrimitive`, and `TemplateValue`.

## Development

```sh
npm run check
npm run test:coverage
npm run size
```

The implementation is **230 executable lines** of authored TypeScript. tsdown
emits **143 executable lines / 6.20 kB / 1.82 kB gzip** of browser ESM with no
runtime dependencies.

## License

[The Unlicense](./LICENSE)
