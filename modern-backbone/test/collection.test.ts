import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { CollectionMembershipDetail, CollectionUpdateDetail } from '../src/collection.js';
import { Collection, Model } from '../src/index.js';
import type { ModelId } from '../src/model.js';

const originalAbortController = globalThis.AbortController;
const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.AbortController = originalAbortController;
	globalThis.fetch = originalFetch;
});

interface UserAttributes {
	id?: ModelId | null;
	name?: string;
}

class User extends Model<UserAttributes> {
	static endpoint = '/api/users';
}

class Users extends Collection<User> {
	static model = User;
}

describe('Collection membership', () => {
	test('converts records, preserves configured models, order, and iteration', () => {
		const ada = new User({ id: 1, name: 'Ada' });
		const users = new Users([ada, { id: 2, name: 'Grace' }]);

		assert.equal(users.length, 2);
		assert.equal(users.models[0], ada);
		assert.ok(users.models[1] instanceof User);
		assert.deepEqual(
			[...users].map((model) => model.get('name')),
			['Ada', 'Grace'],
		);

		const snapshot = users.models;
		snapshot.pop();
		assert.equal(users.length, 2);
		assert.equal(users.models.length, 2);
	});

	test('rejects an invalid configured model and models of the wrong type', () => {
		class InvalidCollection extends Collection {}
		class Other extends Model {}
		Reflect.defineProperty(InvalidCollection, 'model', { value: class Invalid {} });

		assert.throws(() => new InvalidCollection([{}]), /must extend Model/);
		assert.throws(() => Reflect.construct(Users, [[new Other()]]), /Expected an instance of User/);
	});

	test('supports exact and falsey identity keys while leaving nullish models unindexed', () => {
		const users = new Users([
			{ id: 0, name: 'zero' },
			{ id: '', name: 'empty' },
			{ id: 1, name: 'number' },
			{ id: '1', name: 'string' },
			{ id: null, name: 'null' },
			{ name: 'undefined' },
		]);

		assert.equal(users.get(0)?.get('name'), 'zero');
		assert.equal(users.get('')?.get('name'), 'empty');
		assert.equal(users.get(1)?.get('name'), 'number');
		assert.equal(users.get('1')?.get('name'), 'string');
		assert.equal(users.length, 6);
	});

	test('returns an existing identity without merging or emitting events', () => {
		const users = new Users([{ id: 1, name: 'Ada' }]);
		const existing = users.get(1);
		assert.ok(existing);
		const events: string[] = [];
		users.addEventListener('add', (event) => events.push(event.type));
		users.addEventListener('update', (event) => events.push(event.type));

		assert.equal(users.add({ id: 1, name: 'Grace' }), existing);
		assert.equal(users.add(existing), existing);
		assert.equal(existing.get('name'), 'Ada');
		assert.equal(users.length, 1);
		assert.deepEqual(events, []);
	});

	test('allows distinct unsaved models but not the same instance twice', () => {
		const first = new User({ name: 'Ada' });
		const second = new User({ name: 'Grace' });
		const users = new Users();

		assert.equal(users.add(first), first);
		assert.equal(users.add(first), first);
		assert.equal(users.add(second), second);
		assert.equal(users.length, 2);
	});

	test('removes by model or exact id and ignores unknown values', () => {
		const users = new Users([
			{ id: 1, name: 'Ada' },
			{ id: '1', name: 'Grace' },
		]);
		const numeric = users.get(1);
		const string = users.get('1');
		assert.ok(numeric);
		assert.ok(string);

		assert.equal(users.remove('1'), string);
		assert.equal(users.remove(numeric), numeric);
		assert.equal(users.remove('missing'), undefined);
		assert.equal(users.length, 0);
	});
});

describe('Collection identity updates', () => {
	test('indexes ids assigned after insertion and removes stale keys', () => {
		const user = new User({ name: 'Ada' });
		const users = new Users([user]);

		user.set('id', 1);
		assert.equal(users.get(1), user);

		user.set('id', 'ada');
		assert.equal(users.get(1), undefined);
		assert.equal(users.get('ada'), user);

		user.set('id', null);
		assert.equal(users.get('ada'), undefined);
		// @ts-expect-error Exercise nullish identity behavior at the runtime boundary.
		assert.equal(users.get(null), undefined);
	});

	test('uses the last model in collection order for id collisions', () => {
		const first = new User({ id: 1, name: 'Ada' });
		const second = new User({ id: 2, name: 'Grace' });
		const users = new Users([first, second]);

		second.set('id', 1);
		assert.equal(users.length, 2);
		assert.equal(users.get(1), second);

		assert.equal(users.remove(second), second);
		assert.equal(users.get(1), first);
	});
});

describe('Collection events and cleanup', () => {
	test('emits add and update after insertion with exact details', () => {
		const users = new Users();
		let addDetail: CollectionMembershipDetail<User> | undefined;
		let addLength: number | undefined;
		let updateDetail: CollectionUpdateDetail<User> | undefined;
		users.addEventListener('add', (event) => {
			addDetail = event.detail;
			addLength = users.length;
		});
		users.addEventListener('update', (event) => {
			updateDetail = event.detail;
		});

		const user = users.add({ id: 1, name: 'Ada' });

		assert.equal(addLength, 1);
		assert.deepEqual(addDetail, { collection: users, index: 0, model: user });
		assert.deepEqual(updateDetail, {
			added: [user],
			collection: users,
			removed: [],
		});
	});

	test('emits remove and update after removal with the former index', () => {
		const first = new User({ id: 1 });
		const second = new User({ id: 2 });
		const users = new Users([first, second]);
		let removeDetail: CollectionMembershipDetail<User> | undefined;
		let removeLength: number | undefined;
		let updateDetail: CollectionUpdateDetail<User> | undefined;
		let eventCount = 0;
		users.addEventListener('remove', (event) => {
			eventCount += 1;
			removeDetail = event.detail;
			removeLength = users.length;
		});
		users.addEventListener('update', (event) => {
			eventCount += 1;
			updateDetail = event.detail;
		});

		assert.equal(users.remove(second), second);

		assert.equal(eventCount, 2);
		assert.equal(removeLength, 1);
		assert.deepEqual(removeDetail, { collection: users, index: 1, model: second });
		assert.deepEqual(updateDetail, {
			added: [],
			collection: users,
			removed: [second],
		});

		assert.equal(users.remove(99), undefined);
		assert.equal(eventCount, 2);
	});

	test('automatically removes a successfully destroyed model', async () => {
		const user = new User({ id: 1 });
		const first = new Users([user]);
		const second = new Users([user]);
		globalThis.fetch = async () => new Response(null, { status: 204 });

		await user.destroy();

		assert.equal(first.length, 0);
		assert.equal(second.length, 0);
		assert.equal(first.get(1), undefined);
		assert.equal(second.get(1), undefined);
	});

	test('aborts model subscriptions when a member is removed', () => {
		const controllers: AbortController[] = [];
		globalThis.AbortController = class TrackingAbortController extends originalAbortController {
			constructor() {
				super();
				controllers.push(this);
			}
		};
		const user = new User({ id: 1 });
		const users = new Users([user]);
		let updates = 0;
		users.addEventListener('update', () => {
			updates += 1;
		});

		users.remove(user);

		assert.equal(controllers.length, 1);
		assert.equal(controllers[0]?.signal.aborted, true);
		assert.equal(updates, 1);

		user.set('id', 2);
		user.dispatchEvent(new CustomEvent('destroy', { detail: { model: user } }));
		assert.equal(users.get(2), undefined);
		assert.equal(updates, 1);
	});
});
