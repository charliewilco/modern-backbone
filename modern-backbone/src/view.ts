import type { AttributesOf, Collection, CollectionEventMap } from './collection.js';
import type { Model, ModelEventMap } from './model.js';

// biome-ignore lint/suspicious/noExplicitAny: View listeners accept Models of any attribute schema.
type AnyModel = Model<any>;

export interface ViewOptions<
	ModelTarget extends EventTarget = EventTarget,
	CollectionTarget extends EventTarget = EventTarget,
> {
	el?: HTMLElement;
	model?: ModelTarget;
	collection?: CollectionTarget;
}

export type ViewListenOptions = Omit<AddEventListenerOptions, 'signal'>;

export interface ViewDestroyOptions {
	remove?: boolean;
}

export class View<
	ModelTarget extends EventTarget = EventTarget,
	CollectionTarget extends EventTarget = EventTarget,
> {
	readonly el: HTMLElement;
	readonly model: ModelTarget | undefined;
	readonly collection: CollectionTarget | undefined;
	#lifetime = new AbortController();

	constructor(options: ViewOptions<ModelTarget, CollectionTarget> = {}) {
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

	listen<
		Target extends AnyModel,
		Type extends keyof ModelEventMap<AttributesOf<Target>, Target> & string,
	>(
		target: Target,
		type: Type,
		listener: (event: ModelEventMap<AttributesOf<Target>, Target>[Type]) => unknown,
		options?: ViewListenOptions,
	): this;
	listen<TargetModel extends AnyModel, Type extends keyof CollectionEventMap<TargetModel>>(
		target: Collection<TargetModel>,
		type: Type,
		listener: (event: CollectionEventMap<TargetModel>[Type]) => unknown,
		options?: ViewListenOptions,
	): this;
	listen<Type extends keyof WindowEventMap>(
		target: Window,
		type: Type,
		listener: (this: Window, event: WindowEventMap[Type]) => unknown,
		options?: ViewListenOptions,
	): this;
	listen<Type extends keyof DocumentEventMap>(
		target: Document,
		type: Type,
		listener: (this: Document, event: DocumentEventMap[Type]) => unknown,
		options?: ViewListenOptions,
	): this;
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
