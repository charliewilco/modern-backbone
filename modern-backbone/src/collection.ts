import { Model, type ModelId } from './model.js';

// biome-ignore lint/suspicious/noExplicitAny: Collections accept Models of any attribute schema.
type AnyModel = Model<any>;

export type AttributesOf<M extends AnyModel> =
	M extends Model<infer Attributes> ? Attributes : never;

export type ModelConstructor<M extends AnyModel = Model> = {
	new (attributes?: Partial<AttributesOf<M>>): M;
	endpoint: string;
};

export type CollectionInput<M extends AnyModel> = M | Partial<AttributesOf<M>>;

export interface CollectionMembershipDetail<M extends AnyModel = Model> {
	collection: Collection<M>;
	index: number;
	model: M;
}

export interface CollectionUpdateDetail<M extends AnyModel = Model> {
	added: M[];
	collection: Collection<M>;
	removed: M[];
}

export interface CollectionEventMap<M extends AnyModel = Model> {
	add: CustomEvent<CollectionMembershipDetail<M>>;
	remove: CustomEvent<CollectionMembershipDetail<M>>;
	update: CustomEvent<CollectionUpdateDetail<M>>;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: addEventListener is inherited from EventTarget.
export class Collection<M extends AnyModel = Model> extends EventTarget {
	readonly model: ModelConstructor<M>;
	#models: M[] = [];
	#byId = new Map<ModelId, M>();
	#lifetimes = new Map<M, AbortController>();

	constructor(model: ModelConstructor<M>, models: Iterable<CollectionInput<M>> = []) {
		super();
		if (!(model.prototype === Model.prototype || model.prototype instanceof Model)) {
			throw new TypeError('Collection model must extend Model');
		}
		this.model = model;
		for (const value of models) this.add(value);
	}

	get length(): number {
		return this.#models.length;
	}

	get models(): M[] {
		return [...this.#models];
	}

	add(value: CollectionInput<M>): M {
		if (value instanceof Model && !(value instanceof this.model)) {
			throw new TypeError(`Expected an instance of ${this.model.name}`);
		}
		const model =
			value instanceof this.model ? value : new this.model(value as Partial<AttributesOf<M>>);
		if (this.#models.includes(model)) return model;
		if (model.id !== null && model.id !== undefined) {
			const existing = this.#byId.get(model.id);
			if (existing) return existing;
		}

		const index = this.#models.push(model) - 1;
		const lifetime = new AbortController();
		model.addEventListener('change:id', () => this.#reindex(), {
			signal: lifetime.signal,
		});
		model.addEventListener('destroy', () => this.remove(model), {
			signal: lifetime.signal,
		});
		this.#lifetimes.set(model, lifetime);
		this.#reindex();
		this.#emit('add', model, index);
		return model;
	}

	remove(value: M | ModelId): M | undefined {
		const model =
			typeof value === 'string' || typeof value === 'number' ? this.#byId.get(value) : value;
		if (!model) return undefined;
		const index = this.#models.indexOf(model);
		if (index === -1) return undefined;

		this.#models.splice(index, 1);
		this.#lifetimes.get(model)?.abort();
		this.#lifetimes.delete(model);
		this.#reindex();
		this.#emit('remove', model, index);
		return model;
	}

	get(id: ModelId): M | undefined {
		return this.#byId.get(id);
	}

	[Symbol.iterator](): ArrayIterator<M> {
		return this.#models[Symbol.iterator]();
	}

	#reindex(): void {
		this.#byId.clear();
		for (const model of this.#models) {
			if (model.id !== null && model.id !== undefined) this.#byId.set(model.id, model);
		}
	}

	#emit(type: 'add' | 'remove', model: M, index: number): void {
		const membershipDetail: CollectionMembershipDetail<M> = {
			collection: this,
			index,
			model,
		};
		this.dispatchEvent(new CustomEvent(type, { detail: membershipDetail }));
		const updateDetail: CollectionUpdateDetail<M> = {
			added: type === 'add' ? [model] : [],
			collection: this,
			removed: type === 'remove' ? [model] : [],
		};
		this.dispatchEvent(new CustomEvent('update', { detail: updateDetail }));
	}
}

export interface Collection<M extends AnyModel = Model> {
	addEventListener<Type extends keyof CollectionEventMap<M>>(
		type: Type,
		listener: (event: CollectionEventMap<M>[Type]) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<Type extends keyof CollectionEventMap<M>>(
		type: Type,
		listener: (event: CollectionEventMap<M>[Type]) => void,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	): void;
}
