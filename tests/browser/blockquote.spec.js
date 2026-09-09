const { test, expect } = require('@playwright/test');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');
const quote = String.raw`> If $A_{m,\varepsilon}^{(2)}$ and $B_{m,\varepsilon}^{(2)}$ are within $\delta$, then the unmatched two-dimensional endpoint multiplicity has to propagate through the evaluation chain. Somewhere near $t=1/2$ this produces a rank-$2$ projection $P$ with
>
> $$
> \|[P,x_\varepsilon(1/2)]\|\lesssim C\delta+C'r_m.
> $$
>
> Hence
>
> $$
> \delta\gtrsim \frac{c_\varepsilon-C'r_m}{C}.
> $$`;

for (const dark of [false, true]) {
	test(`preserves quote bars around live equations in ${dark ? 'dark' : 'light'} mode`, async ({ page }, testInfo) => {
		await page.setContent('<!doctype html><html><head></head><body></body></html>');
		await page.addStyleTag({ path: path.join(rootDir, 'dist/katex.min.css') });
		await page.addStyleTag({ path: path.join(rootDir, 'dist/styles.css') });
		await page.addScriptTag({ path: process.env.LIVE_MATH_EDITOR_FIXTURE });
		const doc = `Before\n\n${quote}\n\nAfter`;
		await page.evaluate(options => window.mountMathEditor(options), { doc, dark });
		await page.evaluate(() => document.fonts.ready);

		const widgets = page.locator('.joplin-live-math-display');
		await expect(widgets).toHaveCount(2);
		await expect(page.locator('.joplin-live-math-inline.cm-blockQuote')).toHaveCount(0);
		for (const widget of await widgets.all()) {
			await expect(widget).toHaveClass(/cm-blockQuote/);
			const geometry = await widget.evaluate(element => {
				const line = element.previousElementSibling;
				const style = getComputedStyle(element);
				const lineStyle = getComputedStyle(line);
				const bounds = element.getBoundingClientRect();
				const previousBounds = line.getBoundingClientRect();
				const nextBounds = element.nextElementSibling.getBoundingClientRect();
				return {
					border: style.borderLeft,
					lineBorder: lineStyle.borderLeft,
					opacity: style.opacity,
					lineOpacity: lineStyle.opacity,
					xOffset: bounds.left - previousBounds.left,
					gapAbove: bounds.top - previousBounds.bottom,
					gapBelow: nextBounds.top - bounds.bottom,
				};
			});
			expect(geometry.border).toBe(geometry.lineBorder);
			expect(geometry.opacity).toBe(geometry.lineOpacity);
			expect(Math.abs(geometry.xOffset)).toBeLessThan(1);
			expect(Math.abs(geometry.gapAbove)).toBeLessThan(1);
			expect(Math.abs(geometry.gapBelow)).toBeLessThan(1);
		}
		await page.screenshot({ path: testInfo.outputPath('blockquote.png') });

		await widgets.first().click();
		await expect(widgets).toHaveCount(1);
		await expect(page.locator('.joplin-live-math-source-line')).toHaveCount(3);
		expect(await page.evaluate(() => window.mathEditor.state.doc.toString())).toBe(doc);
		await page.evaluate(() => window.mathEditor.dispatch({ selection: { anchor: 0 } }));
		await expect(page.locator('.joplin-live-math-display.cm-blockQuote')).toHaveCount(2);
	});
}
