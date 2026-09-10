import { View } from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';
import { requiredElement } from './dom.js';
import type { Todo } from './todos.js';

export type ErrorHandler = (error: unknown) => void;

export class TodoItemView extends View<Todo> {
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
