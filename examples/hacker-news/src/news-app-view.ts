import {
	type Model,
	type Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { requiredElement } from './dom.js';
import { type Feed, fetchStoryIds, type Stories, type Story, storyLimit } from './stories.js';
import { StoryDetailView, StoryListView } from './story-views.js';

export class NewsAppView extends View<Model, Stories> {
	#content: HTMLElement;
	#currentView: View | undefined;
	#generation = 0;
	#request: AbortController | undefined;
	#router: Router;
	#status: HTMLParagraphElement;
	#stories: Stories;

	constructor({
		collection,
		el,
		router,
	}: { collection: Stories; el: HTMLElement; router: Router }) {
		super({ collection, el });
		this.#stories = collection;
		this.#router = router;
		this.#content = requiredElement(document, '#content', HTMLElement);
		this.#status = requiredElement(document, '#status', HTMLParagraphElement);
		this.listen(document.body, 'click', (event) => this.#navigate(event));
	}

	async showFeed(feed: Feed): Promise<void> {
		const { generation, signal } = this.#beginRequest();
		this.#selectFeed(feed);
		this.#setStatus(`Loading ${feed} stories…`, true);
		try {
			const ids = await fetchStoryIds(feed, signal);
			const stories = await Promise.all(
				ids.slice(0, storyLimit).map((id) => this.#loadStory(id, signal)),
			);
			if (generation !== this.#generation) return;
			this.#replaceContent(new StoryListView(this.#stories, stories).render());
			this.#setStatus(`${stories.length} ${feed} stories`, false);
		} catch (error) {
			this.#handleError(error, generation);
		}
	}

	async showStory(idText: string): Promise<void> {
		const id = Number(idText);
		const { generation, signal } = this.#beginRequest();
		this.#selectFeed();
		if (!Number.isSafeInteger(id) || id <= 0) {
			this.#showError('That story ID is invalid.');
			return;
		}

		const story = this.#stories.get(id) ?? this.#stories.add({ id });
		this.#replaceContent(new StoryDetailView(story).render());
		this.#setStatus('Loading story…', true);
		try {
			if (!story.get('title')) await story.fetch({ signal });
			if (generation !== this.#generation) return;
			if (!story.get('title')) throw new Error('Story not found.');
			this.#setStatus('Story loaded', false);
		} catch (error) {
			this.#handleError(error, generation);
		}
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		this.#request?.abort();
		this.#currentView?.destroy({ remove: false });
		return super.destroy(options);
	}

	#beginRequest(): { generation: number; signal: AbortSignal } {
		this.#request?.abort();
		this.#request = new AbortController();
		this.#generation += 1;
		return { generation: this.#generation, signal: this.#request.signal };
	}

	#handleError(error: unknown, generation: number): void {
		if (
			generation !== this.#generation ||
			(error instanceof DOMException && error.name === 'AbortError')
		) {
			return;
		}
		this.#showError(error instanceof Error ? error.message : 'Could not load Hacker News.');
	}

	async #loadStory(id: number, signal: AbortSignal): Promise<Story> {
		const story = this.#stories.get(id) ?? this.#stories.add({ id });
		if (!story.get('title')) await story.fetch({ signal });
		return story;
	}

	#navigate(event: Event): void {
		if (!(event instanceof MouseEvent) || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a[data-route]');
		if (!(link instanceof HTMLAnchorElement)) return;
		const destination = new URL(link.href);
		if (destination.origin !== location.origin) return;
		event.preventDefault();
		this.#router.navigate(destination.pathname);
	}

	#replaceContent(view: View): void {
		this.#currentView?.destroy({ remove: false });
		this.#currentView = view;
		this.#content.replaceChildren(view.el);
	}

	#selectFeed(feed?: Feed): void {
		for (const link of document.querySelectorAll('a[data-feed]')) {
			if (!(link instanceof HTMLAnchorElement)) continue;
			if (link.dataset.feed === feed) link.setAttribute('aria-current', 'page');
			else link.removeAttribute('aria-current');
		}
	}

	#setStatus(message: string, busy: boolean): void {
		this.#status.classList.remove('is-error');
		this.#status.textContent = message;
		this.#content.setAttribute('aria-busy', String(busy));
	}

	#showError(message: string): void {
		this.#status.classList.add('is-error');
		this.#status.textContent = message;
		this.#content.setAttribute('aria-busy', 'false');
	}
}
