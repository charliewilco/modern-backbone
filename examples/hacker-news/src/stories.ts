import { Collection, Model } from '@charliewilco/modern-backbone';

export type Feed = 'new' | 'top';

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

export const storyLimit = 12;

function isStoryIds(value: unknown): value is number[] {
	return Array.isArray(value) && value.every(Number.isSafeInteger);
}

export async function fetchStoryIds(feed: Feed, signal: AbortSignal): Promise<number[]> {
	const response = await fetch(`${apiRoot}/${feed}stories.json`, { signal });
	if (!response.ok) throw new Error(`Could not load ${feed} stories (${response.status})`);
	const ids: unknown = await response.json();
	if (!isStoryIds(ids)) throw new TypeError('Expected an array of story IDs');
	return ids;
}

export function storyAge(timestamp: number | undefined): string {
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

export function hostname(url: string | undefined): string {
	if (!url) return 'news.ycombinator.com';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'external link';
	}
}

export class Story extends Model<StoryAttributes> {
	static override endpoint = `${apiRoot}/item`;

	override get url(): string {
		if (this.id === undefined || this.id === null) {
			throw new TypeError('A story without an id does not have a resource URL');
		}
		return `${Story.endpoint}/${encodeURIComponent(String(this.id))}.json`;
	}
}

export class Stories extends Collection<Story> {
	static override model = Story;
}
