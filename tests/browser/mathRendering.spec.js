const { test, expect } = require('@playwright/test');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');

const matrix = String.raw`x_\varepsilon(t)=
\begin{pmatrix}
tI_3+i\varepsilon h(t)D
&
i\left(I_3+\varepsilon h(t)(X+2I_3)\right)
\\[2mm]
i\left(I_3+\varepsilon h(t)(X+2I_3)\right)
&
2I_3
\end{pmatrix}.
\tag{1}`;

const pastedMatrix = String.raw`x\_\varepsilon(t)=
\begin{pmatrix}
tI\_3+i\varepsilon h(t)D
&
i\left(I\_3+\varepsilon h(t)(X+2I\_3)\right)
\\\\[2mm]
i\left(I\_3+\varepsilon h(t)(X+2I\_3)\right)
&
2I\_3
\end{pmatrix}.
\tag{1}`;

for (const [name, source, delimiterSelector] of [
	['font brackets', matrix, '.delimsizing.size4'],
	['SVG brackets in the pasted matrix', pastedMatrix, '.delimsizing.mult svg'],
]) {
	test(`sizes ${name} with Joplin-style CSS injection`, async ({ page }, testInfo) => {
		const assetRequests = [];
		await page.route('http://editor.test/**', route => {
			if (new URL(route.request().url()).pathname !== '/') {
				assetRequests.push(route.request().url());
				return route.fulfill({ status: 404, body: '' });
			}
			return route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><html><head></head><body><div class="cm-editor"><div class="cm-content"><div class="joplin-live-math-display" id="math"></div></div></div></body></html>',
			});
		});
		await page.goto('http://editor.test/');
		// Joplin injects CSS text into its document, without the plugin's file base URL.
		await page.addStyleTag({ path: path.join(rootDir, 'dist/katex.min.css') });
		await page.addStyleTag({ path: path.join(rootDir, 'dist/styles.css') });
		await page.addScriptTag({ path: require.resolve('katex') });
		await page.evaluate(async source => {
			window.katex.render(source, document.getElementById('math'), {
				displayMode: true,
				throwOnError: true,
				trust: false,
			});
			await document.fonts.ready;
		}, source);

		await page.screenshot({ path: testInfo.outputPath('matrix.png') });
		expect(assetRequests, 'Fonts must not resolve relative to the editor URL').toEqual([]);
		expect(await page.evaluate(() => Array.from(document.fonts)
			.filter(font => font.status === 'error').map(font => font.family))).toEqual([]);

		const delimiters = page.locator(`#math .katex-html ${delimiterSelector}`);
		await expect(delimiters).toHaveCount(2);
		const matrixBounds = await page.locator('#math .katex-html .mtable').boundingBox();
		for (const delimiter of await delimiters.all()) {
			const bounds = await delimiter.boundingBox();
			expect(bounds.height).toBeGreaterThanOrEqual(matrixBounds.height * 0.9);
			expect(bounds.width).toBeGreaterThan(0);
		}
	});
}
