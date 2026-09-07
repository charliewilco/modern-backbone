import { expect, type Page, test } from '@playwright/test';

interface ApiCall {
	hostname: string;
	pathname: string;
	searchParams: Record<string, string>;
}

interface MockOpenMeteo {
	forecastCalls: ApiCall[];
	geocodingCalls: ApiCall[];
}

const locations = [
	{
		admin1: 'Oregon',
		country: 'United States',
		id: 5746545,
		latitude: 45.52345,
		longitude: -122.67621,
		name: 'Portland',
	},
	{
		admin1: 'Maine',
		country: 'United States',
		id: 4975802,
		latitude: 43.65737,
		longitude: -70.2589,
		name: 'Portland',
	},
];

const weather = {
	current: {
		apparent_temperature: 16.2,
		relative_humidity_2m: 71,
		temperature_2m: 17.4,
		time: '2026-09-04T14:30',
		weather_code: 2,
		wind_speed_10m: 12.8,
	},
	current_units: {
		relative_humidity_2m: '%',
		temperature_2m: '°C',
		wind_speed_10m: 'km/h',
	},
};

function apiCall(url: URL): ApiCall {
	return {
		hostname: url.hostname,
		pathname: url.pathname,
		searchParams: Object.fromEntries(url.searchParams),
	};
}

async function mockOpenMeteo(page: Page): Promise<MockOpenMeteo> {
	const forecastCalls: ApiCall[] = [];
	const geocodingCalls: ApiCall[] = [];
	await page.route('https://geocoding-api.open-meteo.com/v1/search**', async (route) => {
		geocodingCalls.push(apiCall(new URL(route.request().url())));
		await route.fulfill({ json: { results: locations }, status: 200 });
	});
	await page.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
		forecastCalls.push(apiCall(new URL(route.request().url())));
		await route.fulfill({ json: weather, status: 200 });
	});
	return { forecastCalls, geocodingCalls };
}

async function searchForPortland(page: Page): Promise<void> {
	await page.getByLabel('Find a place').fill('Portland');
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page.getByRole('status')).toHaveText('2 places found.');
}

test('searches Open-Meteo and renders typed collection records', async ({ page }) => {
	const api = await mockOpenMeteo(page);
	await page.goto('/');
	await searchForPortland(page);

	await expect(page.getByRole('heading', { level: 1, name: 'Weather' })).toBeVisible();
	await expect(page.getByRole('listitem')).toHaveCount(2);
	await expect(page.getByRole('link', { name: 'Portland Oregon, United States' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Portland Maine, United States' })).toBeVisible();
	expect(api.geocodingCalls).toEqual([
		{
			hostname: 'geocoding-api.open-meteo.com',
			pathname: '/v1/search',
			searchParams: { count: '5', format: 'json', language: 'en', name: 'Portland' },
		},
	]);
});

test('routes to a selected location and renders its current weather model', async ({ page }) => {
	const api = await mockOpenMeteo(page);
	await page.goto('/');
	await searchForPortland(page);
	await page.getByRole('link', { name: 'Portland Oregon, United States' }).click();

	await expect(page).toHaveURL(/\/weather\/5746545$/);
	await expect(page.getByText('17.4°C')).toBeVisible();
	await expect(page.getByText('Partly cloudy')).toBeVisible();
	await expect(page.getByText('16.2°C')).toBeVisible();
	await expect(page.getByText('71%')).toBeVisible();
	await expect(page.getByText('12.8 km/h')).toBeVisible();
	await expect(page.getByText('Observed 2026-09-04 14:30')).toBeVisible();
	expect(api.forecastCalls).toHaveLength(1);
	expect(api.forecastCalls[0]?.searchParams).toMatchObject({
		forecast_days: '1',
		latitude: '45.52345',
		longitude: '-122.67621',
		timezone: 'auto',
	});
});

test('restores results and weather through browser history', async ({ page }) => {
	const api = await mockOpenMeteo(page);
	await page.goto('/');
	await searchForPortland(page);
	await page.getByRole('link', { name: 'Portland Oregon, United States' }).click();
	await expect(page.getByText('17.4°C')).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
	await expect(page.getByRole('listitem')).toHaveCount(2);

	await page.goForward();
	await expect(page).toHaveURL(/\/weather\/5746545$/);
	await expect(page.getByText('17.4°C')).toBeVisible();
	expect(api.forecastCalls).toHaveLength(2);
});

test('shows a useful error when the public API fails', async ({ page }) => {
	await page.route('https://geocoding-api.open-meteo.com/v1/search**', async (route) => {
		await route.fulfill({ json: { reason: 'Unavailable' }, status: 503 });
	});
	await page.goto('/');
	await page.getByLabel('Find a place').fill('Nowhere');
	await page.getByRole('button', { name: 'Search' }).click();

	await expect(page.getByRole('status')).toHaveText('Could not search places (503)');
	await expect(page.getByRole('status')).toHaveClass(/is-error/);
	await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
});
