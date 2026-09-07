import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
	forbidOnly: Boolean(process.env.CI),
	fullyParallel: false,
	outputDir: './test-results',
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	reporter: 'list',
	testDir: './e2e',
	use: {
		baseURL,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'npm run preview',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: baseURL,
	},
	workers: 1,
});
