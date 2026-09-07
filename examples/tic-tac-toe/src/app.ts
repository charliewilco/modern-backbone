import {
	Collection,
	Model,
	Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';

type Mark = 'O' | 'X';
type ElementConstructor<T extends HTMLElement> = new () => T;

interface CellAttributes {
	id: number;
	value: Mark | null;
}

interface GameAttributes {
	id: string;
	moves: number;
	starter: Mark;
	turn: Mark;
	winner: Mark | null;
}

const winningLines = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6],
] as const;

function requiredElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<T>,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}

function opposite(mark: Mark): Mark {
	return mark === 'X' ? 'O' : 'X';
}

class Cell extends Model<CellAttributes> {
	override get id(): number {
		const id = super.id;
		if (typeof id !== 'number') throw new TypeError('Cell.id must be a number');
		return id;
	}

	get value(): Mark | null {
		return this.get('value') ?? null;
	}
}

class Cells extends Collection<Cell> {
	static override model = Cell;
}

class Game extends Model<GameAttributes> {
	get moves(): number {
		return this.get('moves') ?? 0;
	}

	get starter(): Mark {
		return this.get('starter') ?? 'X';
	}

	get turn(): Mark {
		return this.get('turn') ?? this.starter;
	}

	get winner(): Mark | null {
		return this.get('winner') ?? null;
	}
}

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

class GameView extends View<Game, Cells> {
	#board: HTMLElement;
	#cells: Cells;
	#cellViews = new Map<number, CellView>();
	#game: Game;
	#router: Router;
	#status: HTMLParagraphElement;

	constructor({
		cells,
		el,
		game,
		router,
	}: {
		cells: Cells;
		el: HTMLElement;
		game: Game;
		router: Router;
	}) {
		super({ collection: cells, el, model: game });
		this.#cells = cells;
		this.#game = game;
		this.#router = router;
		this.#board = requiredElement(this.el, '#board', HTMLElement);
		this.#status = requiredElement(this.el, '#game-status', HTMLParagraphElement);

		for (const cell of this.#cells) {
			const view = new CellView({ cell, play: (id) => this.play(id) });
			this.#cellViews.set(cell.id, view);
			this.#board.append(view.render().el);
		}

		this.listen(requiredElement(this.el, '#reset', HTMLButtonElement), 'click', () => {
			this.reset(this.#game.starter);
		});
		this.listen(this.#game, 'change', () => this.render());
		this.listen(this.el, 'click', (event) => this.#navigate(event));
	}

	play(id: number): this {
		const cell = this.#cells.get(id);
		if (!cell || cell.value !== null || this.#game.winner || this.#game.moves === 9) return this;

		const mark = this.#game.turn;
		cell.set('value', mark);
		const moves = this.#game.moves + 1;
		const winner = this.#winningLine(mark).length > 0 ? mark : null;
		this.#game.set({ moves, turn: winner ? mark : opposite(mark), winner });
		return this;
	}

	reset(starter: Mark): this {
		for (const cell of this.#cells) cell.set('value', null);
		this.#game.set({ moves: 0, starter, turn: starter, winner: null });
		return this.render();
	}

	override render(): this {
		const winningIds = new Set(this.#winningLine(this.#game.winner));
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

	#winningLine(mark: Mark | null): readonly number[] {
		if (!mark) return [];
		return (
			winningLines.find((line) => line.every((id) => this.#cells.get(id)?.value === mark)) ?? []
		);
	}
}

const cells = new Cells(
	Array.from({ length: 9 }, (_, id): CellAttributes => ({ id, value: null })),
);
const game = new Game({ id: 'local', moves: 0, starter: 'X', turn: 'X', winner: null });
const router = new Router();
const app = new GameView({
	cells,
	el: requiredElement(document, '#app', HTMLElement),
	game,
	router,
});

router
	.route('/', () => app.reset('X'))
	.route('/play/:starter', ({ starter }) => app.reset(starter === 'O' ? 'O' : 'X'))
	.start();
