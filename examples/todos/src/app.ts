import {
	Collection,
	type CollectionMembershipDetail,
	Model,
	Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';

type ErrorHandler = (error: unknown) => void;
type TodoFilter = 'active' | 'all' | 'completed';
type ElementConstructor<T extends HTMLElement> = new () => T;

interface TodoAttributes {
	id?: number;
	title: string;
	completed: boolean;
}

function requiredElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<T>,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}

class Todo extends Model<TodoAttributes> {
	static override endpoint = '/api/todos';

	get title(): string {
		const title = this.get('title');
		return typeof title === 'string' ? title : '';
	}

	get completed(): boolean {
		return this.get('completed') === true;
	}
}

class Todos extends Collection<Todo> {
	static override model = Todo;
}

class TodoItemView extends View<Todo> {
	#checkbox: HTMLInputElement;
	#deleteButton: HTMLButtonElement;
	#onError: ErrorHandler;
	#onChange: () => void;
	#title: HTMLSpanElement;
	#todo: Todo;

	constructor({
		model,
		onChange,
		onError,
	}: {
		model: Todo;
		onChange: () => void;
		onError: ErrorHandler;
	}) {
		const template = hbs`
			<li class="todo">
				<label class="todo-label">
					<input class="todo-toggle" type="checkbox" />
					<span class="todo-title"></span>
				</label>
				<button class="todo-delete" type="button">Delete</button>
			</li>
		`;
		const el = requiredElement(template, '.todo', HTMLLIElement);
		super({ el, model });

		this.#onError = onError;
		this.#onChange = onChange;
		this.#todo = model;
		this.#checkbox = requiredElement(this.el, '.todo-toggle', HTMLInputElement);
		this.#title = requiredElement(this.el, '.todo-title', HTMLSpanElement);
		this.#deleteButton = requiredElement(this.el, '.todo-delete', HTMLButtonElement);

		this.listen(this.#checkbox, 'change', () => void this.#toggle());
		this.listen(this.#deleteButton, 'click', () => void this.#destroyModel());
		this.listen(this.#todo, 'change:title', () => this.render());
		this.listen(this.#todo, 'change:completed', () => {
			this.render();
			this.#onChange();
		});
	}

	override render(): this {
		const title = this.#todo.title;
		const completed = this.#todo.completed;
		this.#checkbox.checked = completed;
		this.#title.textContent = title;
		this.#deleteButton.setAttribute('aria-label', `Delete ${title || 'untitled todo'}`);
		this.el.classList.toggle('is-completed', completed);
		return this;
	}

	async #toggle(): Promise<void> {
		const previous = this.#todo.completed;
		this.#todo.set('completed', this.#checkbox.checked);
		this.#checkbox.disabled = true;
		try {
			await this.#todo.save();
		} catch (error) {
			this.#todo.set('completed', previous);
			this.#onError(error);
		} finally {
			this.#checkbox.disabled = false;
		}
	}

	async #destroyModel(): Promise<void> {
		this.#deleteButton.disabled = true;
		try {
			await this.#todo.destroy();
		} catch (error) {
			this.#deleteButton.disabled = false;
			this.#onError(error);
		}
	}
}

class TodoListView extends View<Model, Todos> {
	#empty: HTMLParagraphElement;
	#filter: TodoFilter = 'all';
	#list: HTMLUListElement;
	#onError: ErrorHandler;
	#todos: Todos;
	#views = new Map<Todo, TodoItemView>();

	constructor({
		collection,
		el,
		onError,
	}: {
		collection: Todos;
		el: HTMLElement;
		onError: ErrorHandler;
	}) {
		super({ collection, el });
		this.#onError = onError;
		this.#todos = collection;
		this.el.append(hbs`
			<ul class="todo-list"></ul>
			<p class="empty-state"></p>
		`);
		this.#list = requiredElement(this.el, '.todo-list', HTMLUListElement);
		this.#empty = requiredElement(this.el, '.empty-state', HTMLParagraphElement);

		this.listen<CustomEvent<CollectionMembershipDetail<Todo>>>(this.#todos, 'add', (event) => {
			this.#viewFor(event.detail.model);
			this.render();
		});
		this.listen<CustomEvent<CollectionMembershipDetail<Todo>>>(this.#todos, 'remove', (event) => {
			const model = event.detail.model;
			const view = this.#views.get(model);
			view?.destroy();
			this.#views.delete(model);
			this.render();
		});
	}

	setFilter(filter: TodoFilter): this {
		this.#filter = filter;
		return this.render();
	}

	override render(): this {
		const visible = [...this.#todos].filter((model) => {
			if (this.#filter === 'active') return !model.completed;
			if (this.#filter === 'completed') return model.completed;
			return true;
		});

		this.#list.replaceChildren(hbs`${visible.map((model) => this.#viewFor(model).render().el)}`);
		this.#empty.hidden = visible.length > 0;
		this.#empty.textContent =
			this.#todos.length === 0 ? 'Nothing here yet.' : `No ${this.#filter} todos.`;
		return this;
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		for (const view of this.#views.values()) view.destroy();
		this.#views.clear();
		return super.destroy(options);
	}

	#viewFor(model: Todo): TodoItemView {
		let view = this.#views.get(model);
		if (!view) {
			view = new TodoItemView({
				model,
				onChange: () => this.render(),
				onError: this.#onError,
			});
			this.#views.set(model, view);
		}
		return view;
	}
}

class TodoAppView extends View<Model, Todos> {
	#collection: Todos;
	#form: HTMLFormElement;
	#input: HTMLInputElement;
	#listView: TodoListView;
	#router: Router;
	#status: HTMLParagraphElement;
	#submitButton: HTMLButtonElement;

	constructor({
		collection,
		el,
		router,
	}: {
		collection: Todos;
		el: HTMLElement;
		router: Router;
	}) {
		super({ collection, el });
		this.#collection = collection;
		this.#router = router;
		this.#form = requiredElement(this.el, '#new-todo', HTMLFormElement);
		this.#input = requiredElement(this.el, '#todo-title', HTMLInputElement);
		this.#status = requiredElement(this.el, '#status', HTMLParagraphElement);
		this.#submitButton = requiredElement(this.#form, 'button', HTMLButtonElement);
		this.#listView = new TodoListView({
			collection,
			el: requiredElement(this.el, '#todos', HTMLElement),
			onError: (error) => this.showError(error),
		});

		this.listen(this.#form, 'submit', (event) => {
			event.preventDefault();
			void this.#createTodo();
		});
		this.listen(this.el, 'click', (event) => this.#navigate(event));
	}

	setFilter(filter: TodoFilter): this {
		for (const link of this.el.querySelectorAll('a[data-route]')) {
			if (!(link instanceof HTMLAnchorElement)) continue;
			if (link.dataset.route === filter) link.setAttribute('aria-current', 'page');
			else link.removeAttribute('aria-current');
		}
		this.#listView.setFilter(filter);
		return this;
	}

	showError(error: unknown): void {
		this.#status.classList.add('is-error');
		this.#status.textContent = error instanceof Error ? error.message : 'Something went wrong.';
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		this.#listView.destroy({ remove: false });
		return super.destroy(options);
	}

	async #createTodo(): Promise<void> {
		const title = this.#input.value.trim();
		if (!title) return;

		this.#setBusy(true);
		try {
			const todo = new Todo({ completed: false, title });
			await todo.save();
			this.#collection.add(todo);
			this.#form.reset();
			this.#status.classList.remove('is-error');
			this.#status.textContent = `Added ${title}.`;
		} catch (error) {
			this.showError(error);
		} finally {
			this.#setBusy(false);
			this.#input.focus();
		}
	}

	#navigate(event: Event): void {
		if (!(event instanceof MouseEvent) || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a[data-route]');
		if (!(link instanceof HTMLAnchorElement) || !this.el.contains(link)) return;

		const destination = new URL(link.href);
		if (destination.origin !== location.origin) return;
		event.preventDefault();
		this.#router.navigate(destination.pathname);
	}

	#setBusy(busy: boolean): void {
		this.#input.disabled = busy;
		this.#submitButton.disabled = busy;
		this.#form.setAttribute('aria-busy', String(busy));
	}
}

function isTodoAttributes(value: unknown): value is TodoAttributes {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === 'number' &&
		typeof record.title === 'string' &&
		typeof record.completed === 'boolean'
	);
}

async function loadTodos(): Promise<TodoAttributes[]> {
	const response = await fetch(Todo.endpoint);
	if (!response.ok) throw new Error(`Could not load todos (${response.status})`);
	const records: unknown = await response.json();
	if (!Array.isArray(records) || !records.every(isTodoAttributes)) {
		throw new TypeError('Expected an array of todos');
	}
	return records;
}

let records: TodoAttributes[] = [];
let loadError: unknown;
try {
	records = await loadTodos();
} catch (error) {
	loadError = error;
}

const collection = new Todos(records);
const router = new Router();
const app = new TodoAppView({
	collection,
	el: requiredElement(document, '#app', HTMLElement),
	router,
});

router
	.route('/', () => app.setFilter('all'))
	.route('/active', () => app.setFilter('active'))
	.route('/completed', () => app.setFilter('completed'))
	.start();

if (loadError !== undefined) app.showError(loadError);
