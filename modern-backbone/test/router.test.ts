import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { Router } from '../src/index.js';
import { resetDOM } from './support/dom.js';

describe('Router', () => {
	beforeEach(() => resetDOM());

	test('start resolves the initial path once and is idempotent', () => {
		resetDOM('/users/42');
		const router = new Router();
		const ids: string[] = [];
		router.route('/users/:id', ({ id }) => ids.push(id));

		assert.equal(router.start(), router);
		router.start();

		assert.deepEqual(ids, ['42']);
		router.stop();
	});

	test('decodes named parameters exactly once', () => {
		const router = new Router();
		const ids: string[] = [];
		router.route('/users/:id', ({ id }) => ids.push(id));

		router.navigate('/users/Grace%20Hopper');
		router.navigate('/users/a%2Fb');
		router.navigate('/users/%252F');

		assert.deepEqual(ids, ['Grace Hopper', 'a/b', '%2F']);
	});

	test('passes malformed encoded parameters through without throwing', () => {
		const router = new Router();
		let id: string | undefined;
		router.route('/users/:id', (params) => {
			id = params.id;
		});

		assert.doesNotThrow(() => router.navigate('/users/%'));
		assert.equal(id, '%');
	});

	test('uses the first matching route in registration order', () => {
		const router = new Router();
		const calls: string[] = [];
		router
			.route('/items/:id', ({ id }) => calls.push(`dynamic:${id}`))
			.route('/items/special', () => calls.push('static'));

		router.navigate('/items/special');

		assert.deepEqual(calls, ['dynamic:special']);
	});

	test('navigate pushes browser history, preserves URL details, and resolves', () => {
		const router = new Router();
		const initialLength = history.length;
		let id: string | undefined;
		router.route('/users/:id', (params) => {
			id = params.id;
		});

		assert.equal(router.navigate('/users/7?tab=activity#latest'), router);

		assert.equal(history.length, initialLength + 1);
		assert.equal(location.pathname, '/users/7');
		assert.equal(location.search, '?tab=activity');
		assert.equal(location.hash, '#latest');
		assert.equal(id, '7');
	});

	test('navigate can replace the current history entry', () => {
		const router = new Router();
		const initialLength = history.length;
		let matched = false;
		router.route('/replacement', () => {
			matched = true;
		});

		assert.equal(router.navigate('/replacement', { replace: true }), router);

		assert.equal(history.length, initialLength);
		assert.equal(location.pathname, '/replacement');
		assert.equal(matched, true);
	});

	test('popstate resolves the browser current path', () => {
		const router = new Router();
		const calls: string[] = [];
		router.route('/first', () => calls.push('first')).route('/second', () => calls.push('second'));
		router.start();

		history.replaceState(null, '', '/first');
		window.dispatchEvent(new window.PopStateEvent('popstate'));
		history.replaceState(null, '', '/second');
		window.dispatchEvent(new window.PopStateEvent('popstate'));

		assert.deepEqual(calls, ['first', 'second']);
		router.stop();
	});

	test('stop removes popstate handling and restart resolves the current path', () => {
		resetDOM('/first');
		const router = new Router();
		const calls: string[] = [];
		router.route('/first', () => calls.push('first')).route('/second', () => calls.push('second'));

		router.start();
		assert.equal(router.stop(), router);
		history.replaceState(null, '', '/second');
		window.dispatchEvent(new window.PopStateEvent('popstate'));
		assert.deepEqual(calls, ['first']);

		router.start();
		assert.deepEqual(calls, ['first', 'second']);
		router.stop();
	});

	test('unmatched paths do not invoke handlers', () => {
		const router = new Router();
		let calls = 0;
		router.route('/known', () => {
			calls += 1;
		});

		router.navigate('/unknown');

		assert.equal(calls, 0);
	});

	test('uses the latest fallback for unmatched initial, navigated, and popped paths', () => {
		resetDOM('/initial-miss');
		const router = new Router();
		const calls: string[] = [];
		router.fallback((path) => calls.push(`old:${path}`));
		router.fallback((path) => calls.push(path));

		router.start();
		router.navigate('/navigation-miss?query=yes#hash');
		history.replaceState(null, '', '/popstate-miss');
		window.dispatchEvent(new window.PopStateEvent('popstate'));

		assert.deepEqual(calls, ['/initial-miss', '/navigation-miss', '/popstate-miss']);
		router.stop();
	});

	test('does not invoke the fallback when a route matches', () => {
		const router = new Router();
		const calls: string[] = [];
		router.route('/known', () => calls.push('route')).fallback(() => calls.push('fallback'));

		router.navigate('/known');

		assert.deepEqual(calls, ['route']);
	});

	test('treats trailing slashes as equivalent without rewriting the URL', () => {
		const router = new Router();
		const ids: string[] = [];
		router.route('/users/:id/', ({ id }) => ids.push(id));

		router.navigate('/users/42///');

		assert.equal(location.pathname, '/users/42///');
		assert.deepEqual(ids, ['42']);
	});

	test('route requires a leading slash', () => {
		const router = new Router();

		assert.throws(
			// @ts-expect-error Invalid patterns remain guarded at runtime for JavaScript consumers.
			() => router.route('users/:id', () => {}),
			new TypeError('Route patterns must start with /'),
		);
	});

	test('rejects route syntax outside literal and named segments', () => {
		const router = new Router();

		for (const pattern of [
			'/files/*rest',
			'/users/:bad-name',
			'/users/:id/:id',
			'/two//parts',
		] as const) {
			assert.throws(() => router.route(pattern, () => {}), /Invalid route pattern/);
		}
	});

	test('uses URLPattern when the platform provides it', {
		skip: typeof URLPattern !== 'function',
	}, () => {
		const router = new Router();
		let id: string | undefined;
		router.route('/native/:id', (params) => {
			id = params.id;
		});

		router.navigate('/native/platform%20route');

		assert.equal(id, 'platform route');
	});

	test('uses URLPattern for encoded Unicode literal routes', {
		skip: typeof URLPattern !== 'function',
	}, () => {
		const router = new Router();
		let matched = false;
		router.route('/mañana', () => {
			matched = true;
		});

		router.navigate('/ma%C3%B1ana/');

		assert.equal(matched, true);
	});

	test('falls back to segment matching when URLPattern is unavailable', () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLPattern');
		Object.defineProperty(globalThis, 'URLPattern', {
			configurable: true,
			value: undefined,
			writable: true,
		});

		try {
			const router = new Router();
			let id: string | undefined;
			router.route('/fallback/:id', (params) => {
				id = params.id;
			});

			router.navigate('/fallback/Grace%20Hopper');

			assert.equal(id, 'Grace Hopper');
			router.navigate('/fallback');
			assert.equal(id, 'Grace Hopper');
		} finally {
			if (descriptor) Object.defineProperty(globalThis, 'URLPattern', descriptor);
			else Reflect.deleteProperty(globalThis, 'URLPattern');
		}
	});

	test('matches encoded Unicode literals when URLPattern is unavailable', () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLPattern');
		Object.defineProperty(globalThis, 'URLPattern', {
			configurable: true,
			value: undefined,
			writable: true,
		});

		try {
			const router = new Router();
			let matched = false;
			router.route('/mañana', () => {
				matched = true;
			});

			router.navigate('/ma%C3%B1ana/');

			assert.equal(matched, true);
		} finally {
			if (descriptor) Object.defineProperty(globalThis, 'URLPattern', descriptor);
			else Reflect.deleteProperty(globalThis, 'URLPattern');
		}
	});
});
