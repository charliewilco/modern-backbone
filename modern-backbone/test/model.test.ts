import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { Model } from '../src/index.js';
import type { ModelAttributeChangeDetail, ModelChangeDetail, ModelId } from '../src/model.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

interface UserAttributes {
	id?: ModelId | null;
	first?: string;
	last?: string;
	name?: string;
	nan?: number;
	role?: string;
	zero?: number;
}

class User extends Model<UserAttributes> {
	static endpoint = '/api/users';
}

describe('Model attributes', () => {
	test('stores a shallow copy and exposes falsey ids', () => {
		const attributes = { id: 0, name: 'Ada' };
		const model = new User(attributes);

		attributes.name = 'Changed outside';
		assert.equal(model.id, 0);
		assert.equal(model.get('name'), 'Ada');

		const json = model.toJSON();
		json.name = 'Changed snapshot';
		assert.deepEqual(model.toJSON(), { id: 0, name: 'Ada' });
	});

	test('rejects non-record attributes', () => {
		assert.throws(() => Reflect.construct(User, [null]), /attributes must be an object/);
		assert.throws(() => Reflect.construct(User, [[]]), /attributes must be an object/);
		assert.throws(() => Reflect.construct(User, ['Ada']), /attributes must be an object/);
	});

	test('sets one attribute and an atomic batch', () => {
		const model = new User({ first: 'Ada', last: 'Lovelace' });
		const eventTypes: string[] = [];
		let firstDetail: ModelAttributeChangeDetail<User> | undefined;
		let lastDetail: ModelAttributeChangeDetail<User> | undefined;
		let aggregateDetail: ModelChangeDetail<User> | undefined;
		let lastDuringFirstEvent: string | undefined;

		model.addEventListener('change:first', (event) => {
			eventTypes.push(event.type);
			firstDetail = event.detail;
			lastDuringFirstEvent = model.get('last');
		});
		model.addEventListener('change:last', (event) => {
			eventTypes.push(event.type);
			lastDetail = event.detail;
		});
		model.addEventListener('change', (event) => {
			eventTypes.push(event.type);
			aggregateDetail = event.detail;
		});

		assert.equal(model.set('first', 'Grace'), model);
		eventTypes.length = 0;
		assert.equal(model.set({ first: 'Katherine', last: 'Johnson' }), model);

		assert.deepEqual(eventTypes, ['change:first', 'change:last', 'change']);
		assert.equal(lastDuringFirstEvent, 'Johnson');
		assert.deepEqual(firstDetail, {
			model,
			name: 'first',
			previous: 'Grace',
			value: 'Katherine',
		});
		assert.deepEqual(lastDetail, {
			model,
			name: 'last',
			previous: 'Lovelace',
			value: 'Johnson',
		});
		assert.deepEqual(aggregateDetail, {
			model,
			changes: [
				{ name: 'first', previous: 'Grace', value: 'Katherine' },
				{ name: 'last', previous: 'Lovelace', value: 'Johnson' },
			],
		});
	});

	test('uses Object.is and emits nothing for no-op sets', () => {
		const model = new User({ nan: Number.NaN, zero: -0 });
		let changes = 0;
		model.addEventListener('change', () => {
			changes += 1;
		});

		model.set({ nan: Number.NaN, zero: -0 });
		assert.equal(changes, 0);

		model.set('zero', 0);
		assert.equal(changes, 1);
	});

	test('rejects invalid set batches without changing attributes', () => {
		const model = new User({ name: 'Ada' });

		assert.throws(() => Reflect.apply(model.set, model, [null]), /attributes must be an object/);
		assert.throws(() => Reflect.apply(model.set, model, [[]]), /attributes must be an object/);
		assert.deepEqual(model.toJSON(), { name: 'Ada' });
	});
});

describe('Model URLs', () => {
	test('builds encoded resource URLs and accepts falsey assigned ids', () => {
		assert.equal(new User({ id: 'ada/byron' }).url, '/api/users/ada%2Fbyron');
		assert.equal(new User({ id: 0 }).url, '/api/users/0');
		assert.equal(new User({ id: '' }).url, '/api/users/');
	});

	test('normalizes one trailing slash, including a root endpoint', () => {
		class Trailing extends Model {
			static endpoint = '/records/';
		}
		class Root extends Model {
			static endpoint = '/';
		}

		assert.equal(new Trailing({ id: 1 }).url, '/records/1');
		assert.equal(new Root({ id: 1 }).url, '/1');
	});

	test('fails before a request when endpoint or identity is missing', async () => {
		let requests = 0;
		globalThis.fetch = async () => {
			requests += 1;
			return new Response(null, { status: 204 });
		};

		assert.throws(() => new User().url, /without an id/);
		await assert.rejects(new User().fetch(), /without an id/);
		await assert.rejects(new Model({ id: 1 }).fetch(), /endpoint must be a non-empty string/);
		assert.equal(requests, 0);
	});
});

describe('Model persistence', () => {
	test('fetches, forwards request options, and merges a response atomically', async () => {
		const model = new User({ id: 1, name: 'Ada', role: 'programmer' });
		const controller = new AbortController();
		const requests: Array<[RequestInfo | URL, RequestInit]> = [];
		let aggregateChange: ModelChangeDetail<User> | undefined;
		model.addEventListener('change:name', () => {
			assert.equal(model.get('role'), 'mathematician');
		});
		model.addEventListener('change', (event) => {
			aggregateChange = event.detail;
		});
		globalThis.fetch = async (url, init = {}) => {
			requests.push([url, init]);
			return new Response(JSON.stringify({ name: 'Grace', role: 'mathematician' }));
		};

		const result = await model.fetch({
			credentials: 'include',
			headers: { 'x-trace': 'test' },
			method: 'POST',
			signal: controller.signal,
		});

		assert.equal(result, model);
		const request = requests[0];
		assert.ok(request);
		const [url, init] = request;
		assert.equal(url, '/api/users/1');
		assert.equal(init.method, 'GET');
		assert.equal(init.credentials, 'include');
		assert.equal(init.signal, controller.signal);
		assert.deepEqual(init.headers, { 'x-trace': 'test' });
		assert.deepEqual(model.toJSON(), {
			id: 1,
			name: 'Grace',
			role: 'mathematician',
		});
		assert.deepEqual(aggregateChange, {
			model,
			changes: [
				{ name: 'name', previous: 'Ada', value: 'Grace' },
				{ name: 'role', previous: 'programmer', value: 'mathematician' },
			],
		});
	});

	test('accepts empty fetch responses without changing attributes', async () => {
		const model = new User({ id: 1, name: 'Ada' });
		const responses = [
			new Response('', { status: 200 }),
			new Response(null, { status: 204 }),
			new Response(null, { status: 205 }),
		];
		globalThis.fetch = async () => {
			const response = responses.shift();
			assert.ok(response);
			return response;
		};

		await model.fetch();
		await model.fetch();
		await model.fetch();

		assert.deepEqual(model.toJSON(), { id: 1, name: 'Ada' });
	});

	test('rejects invalid fetch payloads without mutating the model', async () => {
		const model = new User({ id: 1, name: 'Ada' });
		globalThis.fetch = async () => new Response(JSON.stringify([{ name: 'Grace' }]));

		await assert.rejects(model.fetch(), /Expected a JSON object/);
		assert.deepEqual(model.toJSON(), { id: 1, name: 'Ada' });

		globalThis.fetch = async () => new Response('{');
		await assert.rejects(model.fetch(), SyntaxError);
		assert.deepEqual(model.toJSON(), { id: 1, name: 'Ada' });
	});

	test('reports HTTP failures with the response as the cause', async () => {
		const model = new User({ id: 1, name: 'Ada' });
		const response = new Response('invalid', {
			status: 422,
			statusText: 'Unprocessable Entity',
		});
		globalThis.fetch = async () => response;

		await assert.rejects(model.fetch(), (error) => {
			assert.ok(error instanceof Error);
			assert.equal(error.message, 'HTTP 422 Unprocessable Entity');
			assert.equal(error.cause, response);
			return true;
		});
		assert.deepEqual(model.toJSON(), { id: 1, name: 'Ada' });
	});

	test('propagates native fetch errors unchanged', async () => {
		const failure = new DOMException('Stopped', 'AbortError');
		globalThis.fetch = async () => {
			throw failure;
		};

		await assert.rejects(new User({ id: 1 }).fetch(), (error) => error === failure);
	});

	test('posts unsaved models and merges a server-assigned identity', async () => {
		const model = new User({ name: 'Ada' });
		const requests: Array<[RequestInfo | URL, RequestInit]> = [];
		globalThis.fetch = async (url, init = {}) => {
			requests.push([url, init]);
			return new Response(JSON.stringify({ id: 42, name: 'Ada Lovelace' }), {
				status: 201,
			});
		};

		const result = await model.save({
			body: 'caller body',
			headers: { 'x-trace': 'test' },
			method: 'DELETE',
		});

		assert.equal(result, model);
		const request = requests[0];
		assert.ok(request);
		const [url, init] = request;
		assert.equal(url, '/api/users');
		assert.equal(init.method, 'POST');
		assert.equal(init.body, JSON.stringify({ name: 'Ada' }));
		assert.ok(init.headers instanceof Headers);
		assert.equal(init.headers.get('content-type'), 'application/json');
		assert.equal(init.headers.get('x-trace'), 'test');
		assert.equal(model.id, 42);
		assert.equal(model.get('name'), 'Ada Lovelace');
	});

	test('puts assigned models and preserves an explicit content type', async () => {
		const model = new User({ id: '', name: 'Ada' });
		const requests: Array<[RequestInfo | URL, RequestInit]> = [];
		globalThis.fetch = async (url, init = {}) => {
			requests.push([url, init]);
			return new Response(null, { status: 204 });
		};

		await model.save({ headers: { 'content-type': 'application/vnd.api+json' } });

		const request = requests[0];
		assert.ok(request);
		const [url, init] = request;
		assert.equal(url, '/api/users/');
		assert.equal(init.method, 'PUT');
		assert.ok(init.headers instanceof Headers);
		assert.equal(init.headers.get('content-type'), 'application/vnd.api+json');
		assert.equal(init.body, JSON.stringify({ id: '', name: 'Ada' }));
		assert.deepEqual(model.toJSON(), { id: '', name: 'Ada' });
	});

	test('does not roll back local state when save fails', async () => {
		const model = new User({ id: 1, name: 'Grace' });
		const response = new Response(null, { status: 503, statusText: 'Unavailable' });
		globalThis.fetch = async () => response;

		await assert.rejects(model.save(), (error) => {
			assert.ok(error instanceof Error);
			return error.cause === response;
		});
		assert.deepEqual(model.toJSON(), { id: 1, name: 'Grace' });
	});

	test('destroys an assigned model only after a successful delete', async () => {
		const model = new User({ id: 0 });
		const requests: Array<[RequestInfo | URL, RequestInit]> = [];
		let destroyed = 0;
		model.addEventListener('destroy', (event) => {
			destroyed += 1;
			assert.equal(event.detail.model, model);
		});
		globalThis.fetch = async (url, init = {}) => {
			requests.push([url, init]);
			return new Response(null, { status: 204 });
		};

		assert.equal(await model.destroy({ method: 'POST' }), model);
		assert.deepEqual(requests, [['/api/users/0', { method: 'DELETE' }]]);
		assert.equal(destroyed, 1);

		const response = new Response(null, { status: 500, statusText: 'Broken' });
		globalThis.fetch = async () => response;
		await assert.rejects(model.destroy(), (error) => {
			assert.ok(error instanceof Error);
			return error.cause === response;
		});
		assert.equal(destroyed, 1);
	});

	test('does not request destruction for an unsaved model', async () => {
		let requests = 0;
		globalThis.fetch = async () => {
			requests += 1;
			return new Response(null, { status: 204 });
		};

		await assert.rejects(new User().destroy(), /without an id/);
		assert.equal(requests, 0);
	});
});
