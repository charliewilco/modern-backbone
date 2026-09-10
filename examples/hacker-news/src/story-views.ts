import { type Model, View, type ViewDestroyOptions } from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';
import { requiredElement } from './dom.js';
import { hostname, type Stories, type Story, storyAge } from './stories.js';

export class StoryView extends View<Story> {
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

export class StoryListView extends View<Model, Stories> {
	#storyViews: StoryView[];

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

export class StoryDetailView extends View<Story> {
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
