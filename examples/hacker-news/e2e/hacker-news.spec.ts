import { expect, type Page, test } from '@playwright/test';

interface StoryRecord {
	by: string;
	descendants: number;
	id: number;
	score: number;
	time: number;
	title: string;
	type: 'story';
	url?: string;
}

interface HnCall {
	pathname: string;
}

const stories = new Map<number, StoryRecord>([
	[
		101,
		{
			by: 'ada',
			descendants: 12,
			id: 101,
			score: 88,
			time: 1_700_000_000,
			title: 'The browser caught up',
			type: 'story',
			url: 'https://example.com/browser',
		},
	],
	[
		102,
		{
			by: 'grace',
			descendants: 4,
			id: 102,
			score: 34,
			time: 1_700_000_100,
			title: 'Small libraries age better',
			type: 'story',
			url: 'https://example.org/libraries',
		},
	],
	[
		201,
		{
			by: 'linus',
			descendants: 0,
			id: 201,
			score: 3,
			time: 1_700_000_200,
			title: 'A brand new submission',
			type: 'story',
		},
	],
]);

async function mockHackerNews(page: Page): Promise<HnCall[]> {
	const calls: HnCall[] = [];
	await page.route('https://hacker-news.firebaseio.com/v0/**', async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		calls.push({ pathname });
		if (pathname.endsWith('/topstories.json')) {
			await route.fulfill({ json: [101, 102] });
			return;
		}
		if (pathname.endsWith('/newstories.json')) {
			await route.fulfill({ json: [201, 101] });
			return;
		}
		const match = /\/item\/(\d+)\.json$/.exec(pathname);
		const story = stories.get(Number(match?.[1]));
		await route.fulfill(
			story ? { json: story } : { body: 'null', contentType: 'application/json' },
		);
	});
	return calls;
}

test('loads and renders top stories through Model.fetch and Collection identity', async ({
	page,
}) => {
	const calls = await mockHackerNews(page);
	await page.goto('/');

	await expect(page.getByRole('listitem')).toHaveCount(2);
	await expect(page.getByRole('link', { name: 'Top', exact: true })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(page.getByRole('link', { name: 'The browser caught up' })).toHaveAttribute(
		'href',
		'https://example.com/browser',
	);
	await expect(page.getByText('88 points by ada')).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('2 top stories');
	expect(calls.map(({ pathname }) => pathname)).toEqual([
		'/v0/topstories.json',
		'/v0/item/101.json',
		'/v0/item/102.json',
	]);
});

test('routes between feeds and restores the previous feed with browser history', async ({
	page,
}) => {
	const calls = await mockHackerNews(page);
	await page.goto('/');
	await expect(page.getByRole('listitem')).toHaveCount(2);

	await page.getByRole('link', { name: 'New', exact: true }).click();
	await expect(page).toHaveURL(/\/new$/);
	await expect(page.getByRole('link', { name: 'New', exact: true })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(page.getByRole('link', { name: 'A brand new submission' })).toBeVisible();
	await expect(page.getByRole('listitem')).toHaveCount(2);

	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('link', { name: 'Top', exact: true })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(page.getByRole('link', { name: 'The browser caught up' })).toBeVisible();

	const item101Calls = calls.filter(({ pathname }) => pathname === '/v0/item/101.json');
	expect(item101Calls).toHaveLength(1);
});

test('resolves a parameterized story route and reuses an already fetched model', async ({
	page,
}) => {
	const calls = await mockHackerNews(page);
	await page.goto('/');
	await expect(page.getByRole('listitem')).toHaveCount(2);

	await page.getByRole('link', { name: '12 comments' }).click();
	await expect(page).toHaveURL(/\/story\/101$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('The browser caught up');
	await expect(page.getByRole('link', { name: 'Read on example.com' })).toHaveAttribute(
		'href',
		'https://example.com/browser',
	);
	await expect(page.getByRole('link', { name: '12 comments on Hacker News' })).toHaveAttribute(
		'href',
		'https://news.ycombinator.com/item?id=101',
	);
	await expect(page.getByRole('status')).toHaveText('Story loaded');

	const item101Calls = calls.filter(({ pathname }) => pathname === '/v0/item/101.json');
	expect(item101Calls).toHaveLength(1);
});

test('loads a deep-linked story and Parcel provides History fallback', async ({ page }) => {
	const calls = await mockHackerNews(page);
	await page.goto('/story/201');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('A brand new submission');
	await expect(page.getByRole('link', { name: '0 comments on Hacker News' })).toBeVisible();
	expect(calls).toEqual([{ pathname: '/v0/item/201.json' }]);
});
