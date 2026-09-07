import { Model, type ModelId } from './model.js';

export type AttributesOf<M extends Model> = M extends Model<infer Attributes> ? Attributes : never;

export type ModelConstructor<M extends Model = Model> = {
	new (attributes?: Partial<AttributesOf<M>>): M;
	endpoint: string;
};

export type CollectionInput<M extends Model> = M | Partial<AttributesOf<M>>;

export interface CollectionMembershipDetail<M extends Model = Model> {
	collection: Collection<M>;
	index: number;
	model: M;
}

export interface CollectionUpdateDetail<M extends Model = Model> {
	added: M[];
	collection: Collection<M>;
	removed: M[];
}

export interface CollectionEventMap<M extends Model = Model> {
	add: CustomEvent<CollectionMembershipDetail<M>>;
	remove: CustomEvent<CollectionMembershipDetail<M>>;
	update: CustomEvent<CollectionUpdateDetail<M>>;
}

type RuntimeModelConstructor = {
	new (...args: never[]): Model;
	endpoint: string;
};

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: addEventListener is inherited from EventTarget.
export class Collection<M extends Model = Model> extends EventTarget {
	static model: RuntimeModelConstructor = Model;
	#models: M[] = [];
	#byId = new Map<ModelId, M>();
	#lifetimes = new Map<M, AbortController>();

	constructor(models: Iterable<CollectionInput<M>> = []) {
		super();
		for (const model of models) this.add(model);
	}

	get length(): number {
		return this.#models.length;
	}

	get models(): M[] {
		return [...this.#models];
	}

	add(value: CollectionInput<M>): M {
		const CollectionClass = this.constructor as typeof Collection;
		const ModelClass = CollectionClass.model as ModelConstructor<M>;
		if (!(ModelClass.prototype instanceof Model || ModelClass === Model)) {
			throw new TypeError('Collection.model must extend Model');
		}
		if (value instanceof Model && !(value instanceof ModelClass)) {
			throw new TypeError(`Expected an instance of ${ModelClass.name}`);
		}
		const model =
			value instanceof ModelClass ? value : new ModelClass(value as Partial<AttributesOf<M>>);
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
		const model = value instanceof Model ? value : this.#byId.get(value);
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

export interface Collection<M extends Model = Model> {
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
}
