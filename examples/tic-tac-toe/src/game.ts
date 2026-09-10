import { Collection, type CollectionInput, Model } from '@charliewilco/modern-backbone';

export type Mark = 'O' | 'X';

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

const opposite = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');

export class Cell extends Model<CellAttributes> {
	override get id(): number {
		const id = super.id;
		if (typeof id !== 'number') throw new TypeError('Cell.id must be a number');
		return id;
	}

	get value(): Mark | null {
		return this.get('value') ?? null;
	}
}

export class Cells extends Collection<Cell> {
	constructor(models: Iterable<CollectionInput<Cell>> = []) {
		super(Cell, models);
	}
}

export class Game extends Model<GameAttributes> {
	readonly cells = new Cells(
		Array.from({ length: 9 }, (_, id): CellAttributes => ({ id, value: null })),
	);

	constructor() {
		super({ id: 'local', moves: 0, starter: 'X', turn: 'X', winner: null });
	}

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

	get winningLine(): readonly number[] {
		if (!this.winner) return [];
		return (
			winningLines.find((line) => line.every((id) => this.cells.get(id)?.value === this.winner)) ??
			[]
		);
	}

	play(id: number): this {
		const cell = this.cells.get(id);
		if (!cell || cell.value !== null || this.winner || this.moves === 9) return this;

		const mark = this.turn;
		cell.set('value', mark);
		const moves = this.moves + 1;
		const winner = winningLines.some((line) =>
			line.every((winningId) => this.cells.get(winningId)?.value === mark),
		)
			? mark
			: null;
		this.set({ moves, turn: winner ? mark : opposite(mark), winner });
		return this;
	}

	reset(starter: Mark): this {
		for (const cell of this.cells) cell.set('value', null);
		this.set({ moves: 0, starter, turn: starter, winner: null });
		return this;
	}
}
