const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.beforeEach(async ({ page }) => {
	await page.setContent('<!doctype html><html><head></head><body></body></html>');
	await page.addStyleTag({ path: path.resolve(__dirname, '../../dist/katex.min.css') });
	await page.addStyleTag({ path: path.resolve(__dirname, '../../dist/styles.css') });
	await page.addScriptTag({ path: process.env.LIVE_MATH_EDITOR_FIXTURE });
});

test('copying a backwards source selection preserves the text and selection', async ({ page }) => {
	const doc = 'Before $x^2$ after';
	await page.evaluate(doc => window.mountMathEditor({ doc }), doc);
	await page.locator('.joplin-live-math-inline').click();
	await expect(page.locator('.joplin-live-math-source-inline')).toHaveCount(1);
	const copied = await page.evaluate(() => {
		const view = window.mathEditor;
		view.dispatch({ selection: { anchor: 12, head: 7 }, userEvent: 'select.pointer' });
		const data = new DataTransfer();
		view.contentDOM.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
		return {
			text: data.getData('text/plain'),
			anchor: view.state.selection.main.anchor,
			head: view.state.selection.main.head,
			doc: view.state.doc.toString(),
		};
	});
	expect(copied).toEqual({ text: '$x^2$', anchor: 12, head: 7, doc });
	await expect(page.locator('.joplin-live-math-source-inline')).toHaveCount(1);
});

test('can edit multiline math after an inline preview on the same line', async ({ page }) => {
	const doc = 'Before\n\nInline $x$ then $$y\nz$$\n\nAfter';
	await page.evaluate(doc => window.mountMathEditor({ doc }), doc);
	await page.locator('.joplin-live-math-display').click();
	await expect(page.locator('.joplin-live-math-source-line')).toHaveCount(2);
	await expect(page.locator('.joplin-live-math-inline')).toHaveCount(1);
	expect(await page.evaluate(() => window.mathEditor.state.doc.toString())).toBe(doc);
	await page.evaluate(() => window.mathEditor.dispatch({ selection: { anchor: 0 } }));
	await expect(page.locator('.joplin-live-math-display')).toHaveCount(1);
});
