import { Collection, Model } from '@charliewilco/modern-backbone';

export interface TodoAttributes {
	id?: number;
	title: string;
	completed: boolean;
}

export class Todo extends Model<TodoAttributes> {
	static override endpoint = '/api/todos';

	get title(): string {
		const title = this.get('title');
		return typeof title === 'string' ? title : '';
	}

	get completed(): boolean {
		return this.get('completed') === true;
	}
}

export class Todos extends Collection<Todo> {
	static override model = Todo;
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

export async function loadTodos(): Promise<TodoAttributes[]> {
	const response = await fetch(Todo.endpoint);
	if (!response.ok) throw new Error(`Could not load todos (${response.status})`);
	const records: unknown = await response.json();
	if (!Array.isArray(records) || !records.every(isTodoAttributes)) {
		throw new TypeError('Expected an array of todos');
	}
	return records;
}
