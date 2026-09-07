import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { hbs } from '../src/index.js';

describe('hbs', () => {
	it('returns a document fragment containing static markup', () => {
		const fragment = hbs`<main><h1>Hello</h1></main>`;

		assert.ok(fragment instanceof DocumentFragment);
		assert.equal(fragment.querySelector('h1')?.textContent, 'Hello');
	});

	it('renders primitive children as text and empty values as nothing', () => {
		const fragment = hbs`<p>${'hello'} ${42} ${7n} ${Symbol('value')}${true}${false}${null}${undefined}</p>`;

		assert.equal(fragment.textContent, 'hello 42 7 Symbol(value)');
	});

	it('never reparses an interpolated string as HTML', () => {
		const value = '<img src=x onerror=alert(1)>';
		const fragment = hbs`<p>${value}</p>`;

		assert.equal(fragment.querySelector('img'), null);
		assert.equal(fragment.querySelector('p')?.textContent, value);
	});

	it('does not confuse static marker-like text with interpolation slots', () => {
		const fragment = hbs`<p>modern-hbs-slot- modern-hbs-1-slot- ${'value'}</p>`;

		assert.equal(fragment.textContent, 'modern-hbs-slot- modern-hbs-1-slot- value');
	});

	it('inserts nodes by identity', () => {
		const strong = document.createElement('strong');
		strong.textContent = 'important';
		const fragment = hbs`<p>Read ${strong}</p>`;

		assert.equal(fragment.querySelector('strong'), strong);
	});

	it('inserts document fragments and consumes their children', () => {
		const input = document.createDocumentFragment();
		input.append(document.createElement('i'), document.createTextNode('tail'));

		const output = hbs`<div>${input}</div>`;

		assert.equal(input.childNodes.length, 0);
		assert.equal(output.querySelector('div')?.childNodes.length, 2);
	});

	it('flattens nested iterables', () => {
		const em = document.createElement('em');
		em.textContent = 'node';
		const values = ['first', new Set([2, null]), [false, ['last', em]]];

		const fragment = hbs`<p>${values}</p>`;

		assert.equal(fragment.querySelector('p')?.textContent, 'first2lastnode');
	});

	it('supports generators', () => {
		function* values(): Generator<string | number> {
			yield 'one';
			yield 2;
		}

		assert.equal(hbs`<p>${values()}</p>`.textContent, 'one2');
	});

	it('preserves interpolation position in table markup', () => {
		const row = document.createElement('tr');
		row.innerHTML = '<td>Ada</td>';

		const fragment = hbs`<table><tbody>${row}</tbody></table>`;

		assert.equal(fragment.querySelector('tbody')?.firstElementChild, row);
	});

	it('accepts nodes created by another window', () => {
		const otherWindow = new Window();
		const span = otherWindow.document.createElement('span');
		span.textContent = 'elsewhere';

		const fragment = hbs`<div>${span as unknown as Node}</div>`;

		assert.equal(fragment.querySelector('span'), span);
	});

	it('sets quoted, unquoted, and mixed attribute values safely', () => {
		const hostile = '" data-owned="yes';
		const fragment = hbs`<div title=${hostile} class="prefix ${hostile} suffix"></div>`;
		const element = fragment.firstElementChild;

		assert.equal(element?.getAttribute('title'), hostile);
		assert.equal(element?.getAttribute('class'), `prefix ${hostile} suffix`);
		assert.equal(element?.hasAttribute('data-owned'), false);
	});

	it('implements full boolean and nullable attribute semantics', () => {
		const fragment = hbs`
			<input disabled=${true} hidden=${false} data-null=${null} data-void=${undefined} value=${0}>
		`;
		const input = fragment.querySelector('input');

		assert.equal(input?.getAttribute('disabled'), '');
		assert.equal(input?.hasAttribute('hidden'), false);
		assert.equal(input?.hasAttribute('data-null'), false);
		assert.equal(input?.hasAttribute('data-void'), false);
		assert.equal(input?.getAttribute('value'), '0');
	});

	it('renders nullable and boolean mixed attribute values as empty text', () => {
		const fragment = hbs`<div aria-label="before ${false}${true}${null}${undefined} after"></div>`;

		assert.equal(fragment.firstElementChild?.getAttribute('aria-label'), 'before  after');
	});

	it('handles multiple interpolations in one attribute and text node', () => {
		const fragment = hbs`<p data-key="${'a'}:${2}">${'left'}${'right'}</p>`;

		assert.equal(fragment.querySelector('p')?.getAttribute('data-key'), 'a:2');
		assert.equal(fragment.textContent, 'leftright');
	});

	it('throws for dynamic event-handler attributes', () => {
		assert.throws(() => hbs`<button onclick=${'alert(1)'}>Go</button>`, /event-handler/i);
		assert.throws(() => hbs`<button onMouseOver="run ${'now'}">Go</button>`, /event-handler/i);
	});

	it('throws for dynamic iframe documents', () => {
		assert.throws(() => hbs`<iframe srcdoc=${'<script>alert(1)</script>'}></iframe>`, /srcdoc/i);
	});

	it('throws for tag, closing-tag, and attribute-name interpolation', () => {
		assert.throws(() => hbs`<${'section'}>content</section>`, /position/);
		assert.throws(() => hbs`<section>content</${'section'}>`, /position/);
		assert.throws(() => hbs`<div ${'hidden'}></div>`, /position/);
		assert.throws(() => hbs`<div data-${'key'}="value"></div>`, /position/);
	});

	it('throws for interpolation inside comments and raw-text elements', () => {
		assert.throws(() => hbs`<!-- ${'comment'} -->`, /position/);
		assert.throws(() => hbs`<script>${'code'}</script>`, /raw-text/);
		assert.throws(() => hbs`<style>${'css'}</style>`, /raw-text/);
	});

	it('throws when attributes receive nodes, iterables, or objects', () => {
		const node = document.createElement('span');
		assert.throws(() => hbs`<div title=${node}></div>`, /primitive/);
		assert.throws(() => hbs`<div title=${['one', 'two']}></div>`, /primitive/);
		assert.throws(
			() => hbs`<div title=${{ toString: () => 'object' } as never}></div>`,
			/primitive/,
		);
	});

	it('throws when child values are unsupported objects', () => {
		assert.throws(
			() => hbs`<div>${{ toString: () => 'object' } as never}</div>`,
			/primitives, DOM nodes, or iterables/,
		);
	});

	it('does not retain state between evaluations of the same call site', () => {
		const render = (value: string): DocumentFragment => hbs`<p>${value}</p>`;

		assert.equal(render('first').textContent, 'first');
		assert.equal(render('second').textContent, 'second');
	});

	it('reports when no browser document is available', () => {
		const currentDocument = globalThis.document;
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: undefined,
			writable: true,
		});

		try {
			assert.throws(() => hbs`<p>Hello</p>`, /browser document/);
		} finally {
			Object.defineProperty(globalThis, 'document', {
				configurable: true,
				value: currentDocument,
				writable: true,
			});
		}
	});
});
