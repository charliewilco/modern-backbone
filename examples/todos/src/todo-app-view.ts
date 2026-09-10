import {
	type Model,
	type Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { requiredElement } from './dom.js';
import { type TodoFilter, TodoListView } from './todo-list-view.js';
import { Todo, type Todos } from './todos.js';

export class TodoAppView extends View<Model, Todos> {
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
