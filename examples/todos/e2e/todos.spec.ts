import { expect, type Page, test } from '@playwright/test';

interface TodoRecord {
	id: number;
	title: string;
	completed: boolean;
}

interface ApiCall {
	method: string;
	pathname: string;
	body: unknown | undefined;
}

interface MockTodoApi {
	calls: ApiCall[];
}

async function mockTodoApi(page: Page, initialRecords: TodoRecord[]): Promise<MockTodoApi> {
	const calls: ApiCall[] = [];
	const records = initialRecords.map((record) => ({ ...record }));
	let nextId = Math.max(0, ...records.map(({ id }) => id)) + 1;

	await page.route('**/api/todos**', async (route) => {
		const request = route.request();
		const method = request.method();
		const pathname = new URL(request.url()).pathname;
		const body: unknown = request.postData() === null ? undefined : request.postDataJSON();
		calls.push({ body, method, pathname });

		if (pathname === '/api/todos' && method === 'GET') {
			await route.fulfill({ json: records, status: 200 });
			return;
		}

		if (pathname === '/api/todos' && method === 'POST') {
			const attributes = body as Partial<TodoRecord>;
			const record: TodoRecord = {
				completed: attributes.completed === true,
				id: nextId,
				title: String(attributes.title ?? ''),
			};
			nextId += 1;
			records.push(record);
			await route.fulfill({ json: record, status: 201 });
			return;
		}

		const match = /^\/api\/todos\/(\d+)$/.exec(pathname);
		const id = Number(match?.[1]);
		const index = records.findIndex((record) => record.id === id);
		if (!match || index === -1) {
			await route.fulfill({ json: { error: 'Todo not found' }, status: 404 });
			return;
		}

		if (method === 'PUT') {
			const attributes = body as Partial<TodoRecord>;
			const record: TodoRecord = {
				completed: attributes.completed === true,
				id,
				title: String(attributes.title ?? ''),
			};
			records[index] = record;
			await route.fulfill({ json: record, status: 200 });
			return;
		}

		if (method === 'DELETE') {
			records.splice(index, 1);
			await route.fulfill({ status: 204 });
			return;
		}

		await route.fulfill({ json: { error: 'Method not allowed' }, status: 405 });
	});

	return { calls };
}

const todoItem = (page: Page, title: string) =>
	page.getByRole('listitem').filter({ hasText: title });

test('renders records loaded through the REST collection endpoint', async ({ page }) => {
	const api = await mockTodoApi(page, [
		{ completed: true, id: 1, title: 'Read the four primitives' },
		{ completed: false, id: 2, title: 'Build something small' },
	]);

	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
	await expect(page.getByRole('listitem')).toHaveCount(2);
	await expect(page.getByRole('checkbox', { name: 'Read the four primitives' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Build something small' })).not.toBeChecked();
	expect(api.calls).toEqual([{ body: undefined, method: 'GET', pathname: '/api/todos' }]);
});

test('filters through the router and restores filters through browser history', async ({
	page,
}) => {
	await mockTodoApi(page, [
		{ completed: true, id: 1, title: 'Already complete' },
		{ completed: false, id: 2, title: 'Still active' },
	]);
	await page.goto('/completed');

	const all = page.getByRole('link', { name: 'All' });
	const active = page.getByRole('link', { name: 'Active' });
	const completed = page.getByRole('link', { name: 'Completed' });
	await expect(completed).toHaveAttribute('aria-current', 'page');
	await expect(todoItem(page, 'Already complete')).toBeVisible();
	await expect(todoItem(page, 'Still active')).toHaveCount(0);

	await active.click();
	await expect(page).toHaveURL(/\/active$/);
	await expect(active).toHaveAttribute('aria-current', 'page');
	await expect(todoItem(page, 'Still active')).toBeVisible();
	await expect(todoItem(page, 'Already complete')).toHaveCount(0);

	await all.click();
	await expect(page).toHaveURL(/\/$/);
	await expect(all).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('listitem')).toHaveCount(2);

	await page.goBack();
	await expect(page).toHaveURL(/\/active$/);
	await expect(active).toHaveAttribute('aria-current', 'page');
	await expect(todoItem(page, 'Still active')).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/completed$/);
	await expect(completed).toHaveAttribute('aria-current', 'page');
	await expect(todoItem(page, 'Already complete')).toBeVisible();
});

test('persists a checkbox toggle through Model.save', async ({ page }) => {
	const api = await mockTodoApi(page, [{ completed: false, id: 7, title: 'Persist this change' }]);
	await page.goto('/');

	const checkbox = page.getByRole('checkbox', { name: 'Persist this change' });
	const response = page.waitForResponse(
		(candidate) =>
			candidate.url().endsWith('/api/todos/7') && candidate.request().method() === 'PUT',
	);
	await checkbox.check();
	await response;

	await expect(checkbox).toBeChecked();
	await expect(checkbox).toBeEnabled();
	await expect(todoItem(page, 'Persist this change')).toHaveClass(/is-completed/);
	expect(api.calls).toContainEqual({
		body: { completed: true, id: 7, title: 'Persist this change' },
		method: 'PUT',
		pathname: '/api/todos/7',
	});
});

test('creates and renders a todo through Model.save and Collection.add', async ({ page }) => {
	const api = await mockTodoApi(page, []);
	await page.goto('/');

	const input = page.getByLabel('What needs doing?');
	await input.fill('Write the browser test');
	const response = page.waitForResponse(
		(candidate) =>
			candidate.url().endsWith('/api/todos') && candidate.request().method() === 'POST',
	);
	await page.getByRole('button', { name: 'Add todo' }).click();
	await response;

	await expect(todoItem(page, 'Write the browser test')).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Write the browser test' })).not.toBeChecked();
	await expect(page.getByRole('status')).toHaveText('Added Write the browser test.');
	await expect(input).toHaveValue('');
	await expect(input).toBeFocused();
	expect(api.calls).toContainEqual({
		body: { completed: false, title: 'Write the browser test' },
		method: 'POST',
		pathname: '/api/todos',
	});
});

test('destroys a model and removes its owned view', async ({ page }) => {
	const api = await mockTodoApi(page, [{ completed: false, id: 9, title: 'Remove this todo' }]);
	await page.goto('/');

	const response = page.waitForResponse(
		(candidate) =>
			candidate.url().endsWith('/api/todos/9') && candidate.request().method() === 'DELETE',
	);
	await page.getByRole('button', { name: 'Delete Remove this todo' }).click();
	await response;

	await expect(todoItem(page, 'Remove this todo')).toHaveCount(0);
	await expect(page.getByText('Nothing here yet.')).toBeVisible();
	expect(api.calls).toContainEqual({
		body: undefined,
		method: 'DELETE',
		pathname: '/api/todos/9',
	});
});
