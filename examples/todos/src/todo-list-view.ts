import {
	type CollectionMembershipDetail,
	type Model,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';
import { requiredElement } from './dom.js';
import { type ErrorHandler, TodoItemView } from './todo-item-view.js';
import type { Todo, Todos } from './todos.js';

export type TodoFilter = 'active' | 'all' | 'completed';

export class TodoListView extends View<Model, Todos> {
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
