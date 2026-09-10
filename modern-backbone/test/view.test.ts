import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { Collection, type CollectionInput, Model, View } from '../src/index.js';
import { resetDOM } from './support/dom.js';

interface UserAttributes {
	id?: number;
	name?: string;
}

class User extends Model<UserAttributes> {}

class Users extends Collection<User> {
	constructor(models: Iterable<CollectionInput<User>> = []) {
		super(User, models);
	}
}

describe('View', () => {
	beforeEach(() => resetDOM());

	test('owns a default element and keeps optional domain references', () => {
		const model = new EventTarget();
		const collection = new EventTarget();
		const view = new View({ model, collection });

		assert.ok(view.el instanceof HTMLElement);
		assert.equal(view.el.tagName, 'DIV');
		assert.equal(view.model, model);
		assert.equal(view.collection, collection);
	});

	test('owns a supplied element without replacing it', () => {
		const el = document.createElement('section');
		const view = new View({ el });

		assert.equal(view.el, el);
	});

	test('rejects a non-HTMLElement root', () => {
		assert.throws(
			// @ts-expect-error The invalid element deliberately exercises runtime validation.
			() => new View({ el: document.createTextNode('not an element') }),
			new TypeError('View.el must be an HTMLElement'),
		);
	});

	test('base render is chainable', () => {
		const view = new View();

		assert.equal(view.render(), view);
	});

	test('listen infers and subscribes to DOM, model, and collection events', () => {
		const model = new User({ id: 1, name: 'Ada' });
		const collection = new Users([model]);
		const view = new View({ collection, model });
		let clicks = 0;
		const names: Array<string | undefined> = [];
		const added: User[] = [];

		assert.equal(
			view.listen(view.el, 'click', (event) => {
				assert.ok(event instanceof window.MouseEvent);
				clicks += 1;
			}),
			view,
		);
		view.listen(model, 'change:name', (event) => {
			names.push(event.detail.value);
		});
		view.listen(collection, 'add', (event) => {
			added.push(event.detail.model);
		});

		view.el.dispatchEvent(new window.MouseEvent('click'));
		model.set('name', 'Grace');
		const katherine = collection.add({ id: 2, name: 'Katherine' });

		assert.equal(clicks, 1);
		assert.deepEqual(names, ['Grace']);
		assert.deepEqual(added, [katherine]);
	});

	test('listen preserves native listener options', () => {
		const view = new View();
		let calls = 0;

		view.listen(
			view.el,
			'click',
			() => {
				calls += 1;
			},
			{ once: true },
		);

		view.el.dispatchEvent(new Event('click'));
		view.el.dispatchEvent(new Event('click'));

		assert.equal(calls, 1);
	});

	test('destroy aborts every owned subscription and removes the element', () => {
		const model = new EventTarget();
		const view = new View({ model });
		let calls = 0;
		const recordCall = () => {
			calls += 1;
		};

		document.body.append(view.el);
		view.listen(view.el, 'click', recordCall);
		view.listen(model, 'change', recordCall);
		view.el.dispatchEvent(new Event('click'));
		model.dispatchEvent(new Event('change'));

		assert.equal(view.destroy(), view);
		assert.equal(view.el.isConnected, false);

		view.el.dispatchEvent(new Event('click'));
		model.dispatchEvent(new Event('change'));
		assert.equal(calls, 2);
	});

	test('destroy can retain the element while still cleaning up listeners', () => {
		const view = new View();
		let calls = 0;

		document.body.append(view.el);
		view.listen(view.el, 'click', () => {
			calls += 1;
		});

		assert.equal(view.destroy({ remove: false }), view);
		assert.equal(view.el.isConnected, true);

		view.el.dispatchEvent(new Event('click'));
		assert.equal(calls, 0);
	});

	test('destroy is idempotent', () => {
		const view = new View();
		document.body.append(view.el);

		view.destroy();

		assert.doesNotThrow(() => view.destroy());
		assert.equal(view.el.isConnected, false);
	});
});
