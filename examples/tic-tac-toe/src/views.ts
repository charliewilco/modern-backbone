import { type Router, View, type ViewDestroyOptions } from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';

import { requiredElement } from './dom.js';
import type { Cell, Cells, Game, Mark } from './game.js';

class CellView extends View<Cell> {
	#cell: Cell;
	#play: (id: number) => void;

	constructor({ cell, play }: { cell: Cell; play: (id: number) => void }) {
		const el = requiredElement(
			hbs`<button class="cell" type="button"></button>`,
			'button',
			HTMLButtonElement,
		);
		super({ el, model: cell });
		this.#cell = cell;
		this.#play = play;
		this.listen(this.el, 'click', () => this.#play(this.#cell.id));
		this.listen(this.#cell, 'change:value', () => this.render());
	}

	override render(): this {
		const value = this.#cell.value;
		this.el.textContent = value ?? '';
		this.el.dataset.mark = value ?? '';
		this.el.setAttribute('aria-label', `Cell ${this.#cell.id + 1}, ${value ?? 'empty'}`);
		return this;
	}

	setGameState(locked: boolean, winning: boolean): this {
		this.el.toggleAttribute('disabled', locked || this.#cell.value !== null);
		this.el.classList.toggle('is-winning', winning);
		return this;
	}
}

export class GameView extends View<Game, Cells> {
	#board: HTMLElement;
	#cellViews = new Map<number, CellView>();
	#game: Game;
	#router: Router;
	#status: HTMLParagraphElement;

	constructor({ el, game, router }: { el: HTMLElement; game: Game; router: Router }) {
		super({ collection: game.cells, el, model: game });
		this.#game = game;
		this.#router = router;
		this.#board = requiredElement(this.el, '#board', HTMLElement);
		this.#status = requiredElement(this.el, '#game-status', HTMLParagraphElement);

		for (const cell of this.#game.cells) {
			const view = new CellView({ cell, play: (id) => this.#game.play(id) });
			this.#cellViews.set(cell.id, view);
			this.#board.append(view.render().el);
		}

		this.listen(requiredElement(this.el, '#reset', HTMLButtonElement), 'click', () => {
			this.reset(this.#game.starter);
		});
		this.listen(this.#game, 'change', () => this.render());
		this.listen(this.el, 'click', (event) => this.#navigate(event));
	}

	reset(starter: Mark): this {
		this.#game.reset(starter);
		return this.render();
	}

	override render(): this {
		const winningIds = new Set(this.#game.winningLine);
		const locked = this.#game.winner !== null || this.#game.moves === 9;
		for (const [id, view] of this.#cellViews) {
			view.render().setGameState(locked, winningIds.has(id));
		}

		if (this.#game.winner) this.#status.textContent = `${this.#game.winner} wins!`;
		else if (this.#game.moves === 9) this.#status.textContent = 'Draw game.';
		else this.#status.textContent = `${this.#game.turn} to move.`;

		for (const link of this.el.querySelectorAll('a[data-starter]')) {
			if (!(link instanceof HTMLAnchorElement)) continue;
			if (link.dataset.starter === this.#game.starter) {
				link.setAttribute('aria-current', 'page');
			} else {
				link.removeAttribute('aria-current');
			}
		}
		return this;
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		for (const view of this.#cellViews.values()) view.destroy();
		this.#cellViews.clear();
		return super.destroy(options);
	}

	#navigate(event: Event): void {
		if (!(event instanceof MouseEvent) || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a[data-starter]');
		if (!(link instanceof HTMLAnchorElement) || !this.el.contains(link)) return;
		const destination = new URL(link.href);
		if (destination.origin !== location.origin) return;
		event.preventDefault();
		this.#router.navigate(destination.pathname);
	}
}
