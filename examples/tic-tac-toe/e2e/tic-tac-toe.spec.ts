import { expect, type Page, test } from '@playwright/test';

const cell = (page: Page, number: number) => page.locator('.cell').nth(number - 1);

test('renders a fresh game from the root route', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1, name: 'Tic-Tac-Toe' })).toBeVisible();
	await expect(page.locator('.cell')).toHaveCount(9);
	await expect(page.getByRole('status')).toHaveText('X to move.');
	await expect(page.getByRole('link', { name: 'X starts' })).toHaveAttribute(
		'aria-current',
		'page',
	);
});

test('alternates turns and preserves occupied cells', async ({ page }) => {
	await page.goto('/');

	await cell(page, 1).click();
	await expect(cell(page, 1)).toHaveText('X');
	await expect(cell(page, 1)).toBeDisabled();
	await expect(page.getByRole('status')).toHaveText('O to move.');

	await cell(page, 5).click();
	await expect(cell(page, 5)).toHaveText('O');
	await expect(page.getByRole('status')).toHaveText('X to move.');
});

test('detects a win and locks the board', async ({ page }) => {
	await page.goto('/');

	for (const number of [1, 4, 2, 5, 3]) await cell(page, number).click();

	await expect(page.getByRole('status')).toHaveText('X wins!');
	await expect(page.locator('.cell.is-winning')).toHaveCount(3);
	await expect(page.locator('.cell:disabled')).toHaveCount(9);
});

test('resets the current starting player', async ({ page }) => {
	await page.goto('/play/O');
	await cell(page, 5).click();
	await expect(cell(page, 5)).toHaveText('O');

	await page.getByRole('button', { name: 'Reset game' }).click();

	await expect(page.locator('.cell[data-mark=""]')).toHaveCount(9);
	await expect(page.getByRole('status')).toHaveText('O to move.');
});

test('restores the chosen starter through browser history', async ({ page }) => {
	await page.goto('/play/O');
	await expect(page.getByRole('status')).toHaveText('O to move.');
	await expect(page.getByRole('link', { name: 'O starts' })).toHaveAttribute(
		'aria-current',
		'page',
	);

	await page.getByRole('link', { name: 'X starts' }).click();
	await expect(page).toHaveURL(/\/play\/X$/);
	await cell(page, 1).click();
	await expect(cell(page, 1)).toHaveText('X');

	await page.goBack();
	await expect(page).toHaveURL(/\/play\/O$/);
	await expect(page.getByRole('status')).toHaveText('O to move.');
	await expect(cell(page, 1)).toHaveText('');
});
