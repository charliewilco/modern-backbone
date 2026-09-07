import {
	Collection,
	Model,
	Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';

type Feed = 'new' | 'top';
type ElementConstructor<T extends HTMLElement> = new () => T;

interface StoryAttributes {
	by?: string;
	descendants?: number;
	id?: number;
	score?: number;
	time?: number;
	title?: string;
	type?: string;
	url?: string;
}

const apiRoot = 'https://hacker-news.firebaseio.com/v0';
const storyLimit = 12;

function requiredElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<T>,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}

function isStoryIds(value: unknown): value is number[] {
	return Array.isArray(value) && value.every(Number.isSafeInteger);
}

function storyAge(timestamp: number | undefined): string {
	if (timestamp === undefined) return '';
	const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
	const units: ReadonlyArray<readonly [number, string]> = [
		[86_400, 'day'],
		[3_600, 'hour'],
		[60, 'minute'],
	];
	for (const [seconds, label] of units) {
		if (elapsed >= seconds) {
			const count = Math.floor(elapsed / seconds);
			return `${count} ${label}${count === 1 ? '' : 's'} ago`;
		}
	}
	return 'just now';
}

function hostname(url: string | undefined): string {
	if (!url) return 'news.ycombinator.com';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'external link';
	}
}

class Story extends Model<StoryAttributes> {
	static override endpoint = `${apiRoot}/item`;

	override get url(): string {
		if (this.id === undefined || this.id === null) {
			throw new TypeError('A story without an id does not have a resource URL');
		}
		return `${Story.endpoint}/${encodeURIComponent(String(this.id))}.json`;
	}
}

class Stories extends Collection<Story> {
	static override model = Story;
}

class StoryView extends View<Story> {
	#story: Story;

	constructor(story: Story) {
		const template = hbs`<li class="story"></li>`;
		const el = requiredElement(template, '.story', HTMLLIElement);
		super({ el, model: story });
		this.#story = story;
		this.listen(this.#story, 'change', () => this.render());
	}

	override render(): this {
		const id = this.#story.id;
		const title = this.#story.get('title') ?? 'Untitled story';
		const url = this.#story.get('url');
		this.el.replaceChildren(
			hbs`
				<h2>
					<a
						class="story-title"
						href=${url ?? `/story/${id}`}
						rel=${url ? 'noreferrer' : undefined}
						data-route=${url ? undefined : ''}
					>${title}</a>
					<span class="story-source">${hostname(url)}</span>
				</h2>
				<p class="story-meta">
					${this.#story.get('score') ?? 0} points by ${this.#story.get('by') ?? 'unknown'} ·
					${storyAge(this.#story.get('time'))} ·
					<a href=${`/story/${id}`} data-route>
						${this.#story.get('descendants') ?? 0} comments
					</a>
				</p>
			`,
		);
		return this;
	}
}

class StoryListView extends View<Model, Stories> {
	#storyViews: StoryView[] = [];

	constructor(stories: Stories, models: Story[]) {
		const template = hbs`<ol class="story-list"></ol>`;
		const el = requiredElement(template, '.story-list', HTMLOListElement);
		super({ collection: stories, el });
		this.#storyViews = models.map((story) => new StoryView(story));
	}

	override render(): this {
		this.el.replaceChildren(hbs`${this.#storyViews.map((view) => view.render().el)}`);
		return this;
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		for (const view of this.#storyViews) view.destroy({ remove: false });
		this.#storyViews = [];
		return super.destroy(options);
	}
}

class StoryDetailView extends View<Story> {
	#story: Story;

	constructor(story: Story) {
		const template = hbs`<article class="story-detail"></article>`;
		const el = requiredElement(template, '.story-detail', HTMLElement);
		super({ el, model: story });
		this.#story = story;
		this.listen(this.#story, 'change', () => this.render());
	}

	override render(): this {
		const title = this.#story.get('title');
		if (!title) {
			this.el.textContent = 'Loading story…';
			return this;
		}

		const externalURL = this.#story.get('url');
		const externalLink = externalURL
			? hbs`
				<a class="read-story" href=${externalURL} rel="noreferrer">
					Read on ${hostname(externalURL)}
				</a>
			`
			: undefined;
		this.el.replaceChildren(hbs`
			<h1>${title}</h1>
			<p class="story-meta">
				${this.#story.get('score') ?? 0} points by ${this.#story.get('by') ?? 'unknown'} ·
				${storyAge(this.#story.get('time'))}
			</p>
			${externalLink}
			<p class="story-actions">
				<a href=${`https://news.ycombinator.com/item?id=${this.#story.id}`}>
					${this.#story.get('descendants') ?? 0} comments on Hacker News
				</a>
				<a href="/" data-route>Back to top stories</a>
			</p>
		`);
		return this;
	}
}

class NewsAppView extends View<Model, Stories> {
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
			const response = await fetch(`${apiRoot}/${feed}stories.json`, {
				signal,
			});
			if (!response.ok) throw new Error(`Could not load ${feed} stories (${response.status})`);
			const ids: unknown = await response.json();
			if (!isStoryIds(ids)) throw new TypeError('Expected an array of story IDs');
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

const stories = new Stories();
const router = new Router();
const app = new NewsAppView({
	collection: stories,
	el: requiredElement(document, '#app', HTMLElement),
	router,
});

router
	.route('/', () => void app.showFeed('top'))
	.route('/new', () => void app.showFeed('new'))
	.route('/story/:id', ({ id }) => void app.showStory(id))
	.start();
