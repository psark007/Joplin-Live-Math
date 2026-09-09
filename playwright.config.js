const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './tests/browser',
	use: {
		browserName: 'chromium',
		launchOptions: {
			executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
		},
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1200, height: 800 } } },
		{ name: 'narrow', use: { viewport: { width: 390, height: 844 } } },
	],
});
