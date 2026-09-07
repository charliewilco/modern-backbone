export interface ViewOptions<
	Model extends EventTarget = EventTarget,
	Collection extends EventTarget = EventTarget,
> {
	el?: HTMLElement;
	model?: Model;
	collection?: Collection;
}

export type ViewListenOptions = Omit<AddEventListenerOptions, 'signal'>;

export interface ViewDestroyOptions {
	remove?: boolean;
}

export class View<
	Model extends EventTarget = EventTarget,
	Collection extends EventTarget = EventTarget,
> {
	readonly el: HTMLElement;
	readonly model: Model | undefined;
	readonly collection: Collection | undefined;
	#lifetime = new AbortController();

	constructor(options: ViewOptions<Model, Collection> = {}) {
		this.el = options.el ?? document.createElement('div');
		if (!(this.el instanceof HTMLElement)) {
			throw new TypeError('View.el must be an HTMLElement');
		}
		this.model = options.model;
		this.collection = options.collection;
	}

	render(): this {
		return this;
	}

	listen<Target extends HTMLElement, Type extends keyof HTMLElementEventMap>(
		target: Target,
		type: Type,
		listener: (this: Target, event: HTMLElementEventMap[Type]) => unknown,
		options?: ViewListenOptions,
	): this;
	listen<EventType extends Event = Event>(
		target: EventTarget,
		type: string,
		listener: (event: EventType) => unknown,
		options?: ViewListenOptions,
	): this;
	listen(
		target: EventTarget,
		type: string,
		listener: unknown,
		options: ViewListenOptions = {},
	): this {
		target.addEventListener(type, listener as EventListener, {
			...options,
			signal: this.#lifetime.signal,
		});
		return this;
	}

	destroy({ remove = true }: ViewDestroyOptions = {}): this {
		this.#lifetime.abort();
		if (remove) this.el.remove();
		return this;
	}
}
