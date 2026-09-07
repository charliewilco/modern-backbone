export type ModelId = string | number;

export interface ModelAttributes {
	id?: ModelId | null;
	[key: string]: unknown;
}

export interface ModelAttributeChange<Name extends string = string, Value = unknown> {
	name: Name;
	previous: Value | undefined;
	value: Value;
}

export interface ModelAttributeChangeDetail<
	M extends Model = Model,
	Name extends string = string,
	Value = unknown,
> extends ModelAttributeChange<Name, Value> {
	model: M;
}

export interface ModelChangeDetail<M extends Model = Model> {
	changes: ModelAttributeChange[];
	model: M;
}

export interface ModelDestroyDetail<M extends Model = Model> {
	model: M;
}

type AttributeName<Attributes> = Extract<keyof Attributes, string>;

type AttributeChangeFor<Attributes> = {
	[Name in AttributeName<Attributes>]: ModelAttributeChange<Name, Attributes[Name]>;
}[AttributeName<Attributes>];

export type ModelEventMap<
	Attributes extends { id?: ModelId | null },
	M extends Model<Attributes> = Model<Attributes>,
> = {
	change: CustomEvent<ModelChangeDetail<M> & { changes: AttributeChangeFor<Attributes>[] }>;
	destroy: CustomEvent<ModelDestroyDetail<M>>;
} & {
	[Name in AttributeName<Attributes> as `change:${Name}`]: CustomEvent<
		ModelAttributeChangeDetail<M, Name, Attributes[Name]>
	>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const endpointFor = (model: Model): string => {
	const ModelClass = model.constructor as typeof Model;
	const { endpoint } = ModelClass;
	if (typeof endpoint !== 'string' || endpoint.length === 0) {
		throw new TypeError(`${ModelClass.name}.endpoint must be a non-empty string`);
	}
	return endpoint;
};

const requestJSON = async (url: string, init: RequestInit): Promise<unknown> => {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}`.trim(), {
			cause: response,
		});
	}
	if (response.status === 204 || response.status === 205) return null;
	const body = await response.text();
	return body.length === 0 ? null : JSON.parse(body);
};

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: addEventListener is inherited from EventTarget.
export class Model<
	Attributes extends { id?: ModelId | null } = ModelAttributes,
> extends EventTarget {
	static endpoint = '';
	#attributes: Partial<Attributes>;

	constructor(attributes: Partial<Attributes> = {}) {
		super();
		if (!isRecord(attributes)) throw new TypeError('Model attributes must be an object');
		this.#attributes = Object.assign(Object.create(null), attributes) as Partial<Attributes>;
	}

	get id(): Attributes['id'] | undefined {
		return this.#attributes.id;
	}

	get url(): string {
		if (this.id === null || this.id === undefined) {
			throw new TypeError('A model without an id does not have a resource URL');
		}
		const endpoint = endpointFor(this).replace(/\/$/, '');
		return `${endpoint}/${encodeURIComponent(String(this.id))}`;
	}

	get<Key extends AttributeName<Attributes>>(name: Key): Attributes[Key] | undefined {
		return this.#attributes[name];
	}

	set<Key extends AttributeName<Attributes>>(name: Key, value: Attributes[Key]): this;
	set(attributes: Partial<Attributes>): this;
	set<Key extends AttributeName<Attributes>>(
		nameOrAttributes: Key | Partial<Attributes>,
		value?: Attributes[Key],
	): this {
		const attributes =
			typeof nameOrAttributes === 'string' ? { [nameOrAttributes]: value } : nameOrAttributes;
		if (!isRecord(attributes)) throw new TypeError('Model attributes must be an object');

		const changes: ModelAttributeChange[] = [];
		for (const [name, next] of Object.entries(attributes)) {
			const previous = this.#attributes[name as AttributeName<Attributes>];
			if (!Object.is(previous, next)) changes.push({ name, previous, value: next });
		}
		Object.assign(this.#attributes, attributes);

		for (const change of changes) {
			const detail: ModelAttributeChangeDetail<this> = { model: this, ...change };
			this.dispatchEvent(new CustomEvent(`change:${change.name}`, { detail }));
		}
		if (changes.length > 0) {
			const detail: ModelChangeDetail<this> = { changes, model: this };
			this.dispatchEvent(new CustomEvent('change', { detail }));
		}
		return this;
	}

	toJSON(): Partial<Attributes> {
		return { ...this.#attributes };
	}

	async fetch(init: RequestInit = {}): Promise<this> {
		const data = await requestJSON(this.url, { ...init, method: 'GET' });
		if (data !== null) {
			if (!isRecord(data)) throw new TypeError('Expected a JSON object');
			this.set(data as Partial<Attributes>);
		}
		return this;
	}

	async save(init: RequestInit = {}): Promise<this> {
		const headers = new Headers(init.headers);
		if (!headers.has('content-type')) headers.set('content-type', 'application/json');
		const isNew = this.id === null || this.id === undefined;
		const data = await requestJSON(isNew ? endpointFor(this) : this.url, {
			...init,
			body: JSON.stringify(this.toJSON()),
			headers,
			method: isNew ? 'POST' : 'PUT',
		});
		if (data !== null) {
			if (!isRecord(data)) throw new TypeError('Expected a JSON object');
			this.set(data as Partial<Attributes>);
		}
		return this;
	}

	async destroy(init: RequestInit = {}): Promise<this> {
		await requestJSON(this.url, { ...init, method: 'DELETE' });
		const detail: ModelDestroyDetail<this> = { model: this };
		this.dispatchEvent(new CustomEvent('destroy', { detail }));
		return this;
	}
}

export interface Model<Attributes extends { id?: ModelId | null } = ModelAttributes> {
	addEventListener<Type extends keyof ModelEventMap<Attributes, this> & string>(
		type: Type,
		listener: (event: ModelEventMap<Attributes, this>[Type]) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void;
}
