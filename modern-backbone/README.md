# @charliewilco/modern-backbone

> What remains of Backbone once the browser platform has caught up with it?

Four useful ownership boundaries remain: one resource record, one ordered
identity set, one DOM lifetime, and one URL dispatcher. The browser now supplies
events, HTTP, DOM ownership, cancellation, URL matching, and history.

`@charliewilco/modern-backbone` is those four boundaries and nothing around them. It is written
in strict TypeScript, ships browser-first ESM plus declarations, and has no
runtime dependencies. Consumers import emitted JavaScript; they do not need a
TypeScript compiler or a library-specific build step.

```sh
npm install @charliewilco/modern-backbone
```

```ts
import { Collection, Model, Router, View } from '@charliewilco/modern-backbone';

interface UserAttributes {
	id?: number;
	name: string;
}

class User extends Model<UserAttributes> {
	static endpoint = '/api/users';
}

const user = new User({ id: 1, name: 'Ada' });
user.addEventListener('change:name', ({ detail }) => {
	console.log(detail.value);
});
user.set('name', 'Grace');

class Users extends Collection<User> {
	static model = User;
}

const users = new Users([user, { id: 2, name: 'Katherine' }]);

class UserView extends View<User> {
	override render() {
		this.el.textContent = this.model?.get('name') ?? '';
		return this;
	}
}

document.body.append(new UserView({ model: user }).render().el);

new Router()
	.route('/users/:id', ({ id }) => console.log('navigate to user', id))
	.start();
```

## The public API

| Primitive | Public surface | Owns | Does not own |
| --- | --- | --- | --- |
| `Model<Attributes>` | `id`, `url`, `get`, `set`, `toJSON`, `fetch`, `save`, `destroy` | Typed shallow attributes, change events, one-record REST persistence | Validation, nested paths, caching, retries, auth, request coordination |
| `Collection<Model>` | `models`, `length`, `add`, `remove`, `get`, iteration | Typed ordered membership, model construction, identity lookup | Filtering, sorting, pagination, reconciliation, collection fetching |
| `View<Model, Collection>` | `el`, `model`, `collection`, `render`, `listen`, `destroy` | One element and the lifetime of its subscriptions | Templates, reactive rendering, DOM diffing, component state |
| `Router` | `route`, `start`, `stop`, `navigate` | Typed path parameters, History API updates, `popstate` | Rendering, data loading, controllers, layouts, link interception |

### Model

`set(name, value)` and `set(attributes)` commit synchronously and return the
model. A changed key emits `change:<name>` with
`{ model, name, previous, value }`; a batch then emits `change` with
`{ model, changes }`. Listeners see the fully committed batch.

Persistence follows one convention:

- `GET /resources/:id` for `fetch()`
- `POST /resources` for a new model's `save()`
- `PUT /resources/:id` for an identified model's `save()`
- `DELETE /resources/:id` for `destroy()`

Set `static endpoint` on the subclass. The attribute generic types keyed `get`
and `set` calls. Persistence methods accept native `RequestInit`, resolve to the
model, and reject with ordinary errors. Successful JSON object responses are
merged through `set`. `destroy` emits `{ model }` after success.

### Collection

Set `static model` on the subclass and pass that model type to `Collection`.
Raw records become instances of that class.
IDs are exact `Map` keys, so `1` and `'1'` differ. Duplicate IDs reuse the
existing member without merging. `models` is a snapshot; use iteration for the
live order.

Membership emits `add` or `remove` with `{ collection, model, index }`, followed
by `update` with `{ collection, added, removed }`. Model ID changes reindex the
lookup, and a successfully destroyed model removes itself from its collections.

There is deliberately no `Collection.fetch()`. An application can fetch an
array and construct a collection without forcing reset, merge, or pagination
policy into the library.

### View

A View owns an `HTMLElement`. `listen()` is a thin `addEventListener` helper
using one private `AbortController`. `destroy()` aborts every owned subscription
and removes the element; pass `{ remove: false }` to retain it. Rendering stays
explicit and imperative. Applications that want safe tagged templates can add
the separate `@charliewilco/modern-handlebars` package; templating is not a
responsibility of this library.

### Router

Routes are registered in priority order and match pathname literals plus named
segments such as `/users/:id`. Literal patterns infer handler parameters, so
that example exposes `id` as a string. The router uses `URLPattern` when
available and a small exact-match fallback otherwise. Query strings and hashes
stay in history but do not participate in matching. `start()` resolves the
initial URL and listens for `popstate`; `navigate()` calls `pushState` or
`replaceState` and resolves immediately.

## Examples

Every example uses all four primitives, a Parcel production bundle, and a
Chromium Playwright contract. They use the optional
`@charliewilco/modern-handlebars` package for explicit DOM construction. Parcel
serves the static examples with History fallback; Todos has a small application
server because it also provides the REST API. Networked examples mock remote
responses in browser tests so third-party availability is not part of the test
result.

| Command | Example | Port |
| --- | --- | --- |
| `npm run example:todos` | REST-backed Todo app | 4173 |
| `npm run example:hacker-news` | Hacker News API reader | 4174 |
| `npm run example:tic-tac-toe` | Local Tic-Tac-Toe game | 4175 |
| `npm run example:weather` | Open-Meteo weather explorer | 4176 |

Run these commands from the repository root. Server and application
orchestration remain outside the library.

## Development and size

```sh
npm install
npm run check
npm run size
```

`npm run build` uses tsdown to emit bundled ESM, source maps, and declarations
to `dist`. Tests use Node's built-in test runner with `tsx`; Happy DOM supplies
the browser globals, not an alternate component or event system.

The size command reports both forms of the core. The authored TypeScript is
**455 executable lines / 523 physical lines / 15.5 kB**, including the generic
API and event-map declarations. tsdown bundles that into **278 executable lines
/ 288 physical lines / 8.9 kB** of ESM, keeping the runtime inside the target
without removing type information.

The safely removable pieces are the aggregate `update` convenience event and
the no-op base `render`; they remain because one simplifies membership-driven
Views and the other makes the subclass contract explicit. They are the first
cuts if the core grows.

The tests use the upstream Backbone suite as a behavioral catalog, not a
drop-in compatibility contract. Relevant identity, event ordering, REST,
element ownership, cleanup, route precedence, decoding, and History API cases
are adapted to the four-primitives API. Cases for omitted features stay omitted;
making them pass would silently turn this project back into Backbone.

Deliberately absent: jQuery, Underscore, custom event emitters, `extend`, sync
adapters, global history, decorators, plugins, dependency injection, proxies,
JSX, virtual DOM, signals, SSR, hydration, and a centralized store.

## License

[The Unlicense](./LICENSE).
