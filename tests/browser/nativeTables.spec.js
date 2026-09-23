const { test, expect } = require('@playwright/test');
const path = require('node:path');

const tableDoc = 'Before\n\n| $A$ | Notes |\n| --- | --- |\n| $x_i+y_j$ | **Result $x^2$**<br>Next line |\n\nAfter table';

test.beforeEach(async ({ page }) => {
	await page.setContent('<!doctype html><html><head></head><body></body></html>');
	await page.addStyleTag({ path: path.resolve(__dirname, '../../dist/katex.min.css') });
	await page.addStyleTag({ path: path.resolve(__dirname, '../../dist/styles.css') });
	await page.addScriptTag({ path: process.env.LIVE_MATH_EDITOR_FIXTURE });
});

test('cell previews render math before Markdown and escape unsafe markup', async ({ page }) => {
	const result = await page.evaluate(() => {
		const cell = window.renderTableCell('**$a^* b^*$** and `$x=y$`<br><img src=x onerror=alert(1)> [bad](javascript:alert)');
		document.body.appendChild(cell);
		return { math: cell.querySelectorAll('.katex').length, strongMath: cell.querySelectorAll('strong .katex').length,
			breaks: cell.querySelectorAll('br').length, unsafe: cell.querySelectorAll('img,script,a[href^="javascript:"]').length,
			text: cell.textContent };
	});
	expect(result.math).toBe(2);
	expect(result.strongMath).toBe(1);
	expect(result.breaks).toBe(1);
	expect(result.unsafe).toBe(0);
	expect(result.text).toContain('<img src=x onerror=alert(1)>');
});

test('inline cell rendering handles a leading break, links, code, and display math', async ({ page }) => {
	const result = await page.evaluate(() => {
		const cell = window.renderTableCell('<br>[label $x$](https://example.com) ~~old~~ `literal $x$ text` $$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$');
		document.body.appendChild(cell);
		return { math: cell.querySelectorAll('.katex').length, link: cell.querySelector('a')?.getAttribute('href'),
			linkMath: cell.querySelectorAll('a .katex').length, code: cell.querySelector('code')?.textContent,
			breaks: cell.querySelectorAll('br').length, display: cell.querySelectorAll('.katex-display').length,
			errors: cell.querySelectorAll('.katex-error').length };
	});
	expect(result).toEqual({ math: 2, link: 'https://example.com', linkMath: 1, code: 'literal $x$ text', breaks: 1, display: 1, errors: 0 });
});

test.describe('Joplin 3.7.18 native table widget', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(!await page.evaluate(() => window.nativeTablesAvailable), 'Run npm run test:tables to fetch the pinned native widget.');
	});

	const mount = async (page, doc = tableDoc, extra = {}) => {
		await page.evaluate(options => window.mountMathEditor(options), { doc, tables: true, ...extra });
		await expect(page.locator('.joplin-live-math-table-preview').first()).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
	};
	const readDoc = page => page.evaluate(() => window.mathEditor.state.doc.toString());

	test('renders headers and cells without changing native editable DOM or note source', async ({ page }, testInfo) => {
		await mount(page);
		await expect(page.locator('.cm-tw .katex')).toHaveCount(3);
		await expect(page.locator('.cm-tw-text .katex')).toHaveCount(0);
		await expect(page.locator('.joplin-live-math-table-preview strong .katex')).toHaveCount(1);
		await expect(page.locator('.joplin-live-math-table-preview br')).toHaveCount(1);
		await page.screenshot({ path: testInfo.outputPath('native-table-math.png') });
		expect(await readDoc(page)).toBe(tableDoc);
	});

	test('clicks into raw source and Tab navigates to the next math cell', async ({ page }) => {
		// Native Tab handling normalizes table padding even without edits.
		await mount(page);
		await page.evaluate(() => window.setLiveMathEnabled(false));
		await page.locator('.cm-tw tbody .cm-tw-text').first().click();
		await page.keyboard.press('Tab');
		await expect(page.locator('.cm-tw tbody .cm-tw-text').nth(1)).toBeFocused();
		await expect(page.locator('.cm-tw tbody .cm-tw-text').nth(1)).toHaveText('**Result $x^2$**<br>Next line');
		await page.keyboard.press('Shift+Tab');
		await expect(page.locator('.cm-tw tbody .cm-tw-text').first()).toBeFocused();
		await page.keyboard.press('Escape');
		await page.waitForTimeout(650);
		const nativeResult = await readDoc(page);
		await mount(page);
		const cell = page.locator('.cm-tw tbody tr').first().locator('td').first();
		await cell.locator('.joplin-live-math-table-preview').click();
		await expect(cell.locator('.cm-tw-text')).toBeFocused();
		await expect(cell.locator('.cm-tw-text')).toHaveText('$x_i+y_j$');
		await expect(cell.locator('.joplin-live-math-table-preview')).toBeHidden();
		await page.keyboard.press('Tab');
		const next = page.locator('.cm-tw tbody tr').first().locator('td').nth(1);
		await expect(next.locator('.cm-tw-text')).toBeFocused();
		await expect(next.locator('.cm-tw-text')).toHaveText('**Result $x^2$**<br>Next line');
		await page.keyboard.press('Shift+Tab');
		await expect(cell.locator('.cm-tw-text')).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(cell.locator('.joplin-live-math-table-preview')).toBeVisible();
		await page.waitForTimeout(650);
		expect(await readDoc(page)).toBe(nativeResult);
	});

	test('cell edits survive native synchronization and a table rebuild', async ({ page }) => {
		await mount(page);
		const cell = page.locator('.cm-tw tbody tr').first().locator('td').first();
		await cell.locator('.joplin-live-math-table-preview').click();
		await cell.locator('.cm-tw-text').fill('$z_1$<br>$z_2$');
		await page.keyboard.press('Tab');
		await expect.poll(() => readDoc(page)).toContain('$z_1$<br>$z_2$');
		await expect(cell.locator('.joplin-live-math-table-preview .katex')).toHaveCount(2);
		await expect(cell.locator('.joplin-live-math-table-preview br')).toHaveCount(1);
		expect(await readDoc(page)).not.toMatch(/katex|annotation|joplin-live-math/);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(650);
		expect(await readDoc(page)).toContain('$z_1$<br>$z_2$');
	});

	test('copying a rendered cell returns Markdown, and selection does not open the cell', async ({ page }) => {
		await mount(page);
		const result = await page.locator('.cm-tw tbody .joplin-live-math-table-preview').first().evaluate(preview => {
			const range = document.createRange();
			range.selectNodeContents(preview);
			const selection = document.getSelection();
			selection.removeAllRanges(); selection.addRange(range);
			preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const data = new DataTransfer();
			preview.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
			return { text: data.getData('text/plain'), hidden: preview.hidden };
		});
		expect(result).toEqual({ text: '$x_i+y_j$', hidden: false });
		expect(await readDoc(page)).toBe(tableDoc);
	});

	test('disable and re-enable restores native cells without modifying text', async ({ page }) => {
		await mount(page);
		await page.evaluate(() => window.setLiveMathEnabled(false));
		await expect(page.locator('.joplin-live-math-table-preview')).toHaveCount(0);
		await expect(page.locator('.joplin-live-math-table-source-hidden')).toHaveCount(0);
		expect(await readDoc(page)).toBe(tableDoc);
		await page.evaluate(() => window.setLiveMathEnabled(true));
		await expect(page.locator('.cm-tw .katex')).toHaveCount(3);
	});

	test('keeps empty columns aligned and measures the table before hit testing below it', async ({ page }) => {
		const doc = 'Before\n\n| A | B | C |\n| - | - | - |\n| | $$\\begin{pmatrix}a&b\\\\[2mm]c&d\\end{pmatrix}$$ | |\n\nAfter table';
		await mount(page, doc);
		await expect(page.locator('.cm-tw tbody tr td').nth(1).locator('.katex')).toHaveCount(1);
		await expect(page.locator('.cm-tw tbody tr td').first().locator('.katex')).toHaveCount(0);
		await expect.poll(() => page.evaluate(position => {
			const bounds = window.mathEditor.coordsAtPos(position);
			return window.mathEditor.posAtCoords({ x: bounds.left, y: (bounds.top + bounds.bottom) / 2 });
		}, doc.indexOf('After') + 3)).toBe(doc.indexOf('After') + 3);
		expect(await readDoc(page)).toBe(doc);
	});

	test('structural table actions keep math and source intact', async ({ page }) => {
		await mount(page);
		await page.locator('.cm-tw tbody .joplin-live-math-table-preview').first().click({ button: 'right' });
		await page.locator('.cm-tw-ctx-item').filter({ hasText: 'Insert row below' }).click();
		await expect(page.locator('.cm-tw tbody tr')).toHaveCount(2);
		await expect(page.locator('.cm-tw .katex')).toHaveCount(3);
		expect(await readDoc(page)).toContain('$x_i+y_j$');
	});

	test('read-only tables render math without becoming editable', async ({ page }) => {
		await mount(page, tableDoc, { readOnly: true });
		await page.locator('.joplin-live-math-table-preview').first().click();
		await expect(page.locator('.cm-tw-text[contenteditable="true"]')).toHaveCount(0);
		await expect(page.locator('.cm-tw .katex')).toHaveCount(3);
		expect(await readDoc(page)).toBe(tableDoc);
	});

	test('delayed native saves preserve the active source and subsequent previews', async ({ page }) => {
		await mount(page);
		const source = page.locator('.cm-tw tbody .cm-tw-text').first();
		await page.locator('.cm-tw tbody .joplin-live-math-table-preview').first().click();
		await source.fill('$\\alpha+\\beta$');
		await expect.poll(() => readDoc(page)).toContain('$\\alpha+\\beta$');
		await expect(source).toBeFocused();
		await expect(source).toHaveText('$\\alpha+\\beta$');
		await expect(page.locator('.cm-tw tbody .joplin-live-math-table-preview').first()).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(page.locator('.cm-tw tbody .joplin-live-math-table-preview').first()).toBeVisible();
		await expect(page.locator('.cm-tw tbody .joplin-live-math-table-preview annotation').first()).toHaveText('\\alpha+\\beta');
	});

	test('document replacements discard old cell previews', async ({ page }) => {
		await mount(page);
		const replacement = tableDoc.replace('$x_i+y_j$', '$q^3$').replace('$x^2$', 'plain text');
		await page.evaluate(doc => window.mathEditor.dispatch({
			changes: { from: 0, to: window.mathEditor.state.doc.length, insert: doc },
		}), replacement);
		await expect(page.locator('.cm-tw .katex')).toHaveCount(2);
		await expect(page.locator('.cm-tw tbody .joplin-live-math-table-preview annotation')).toHaveText('q^3');
		expect(await readDoc(page)).toBe(replacement);
	});

	for (const backwards of [false, true]) {
		test('dragging ' + (backwards ? 'backward' : 'forward') + ' selects raw cell source without closing it', async ({ page }) => {
			await mount(page);
			const source = page.locator('.cm-tw tbody .cm-tw-text').first();
			await page.locator('.cm-tw tbody .joplin-live-math-table-preview').first().click();
			const edges = await source.evaluate(element => {
				const range = document.createRange();
				range.selectNodeContents(element);
				const bounds = range.getBoundingClientRect();
				return { left: bounds.left + 1, right: bounds.right - 1, y: (bounds.top + bounds.bottom) / 2 };
			});
			await page.mouse.move(backwards ? edges.right : edges.left, edges.y);
			await page.mouse.down();
			await page.mouse.move(backwards ? edges.left : edges.right, edges.y, { steps: 12 });
			await page.mouse.up();
			expect(await page.evaluate(() => document.getSelection().toString())).toBe('$x_i+y_j$');
			await expect(source).toBeFocused();
			await expect(page.locator('.cm-tw tbody .joplin-live-math-table-preview').first()).toBeHidden();
		});
	}

	test('escaped pipes, multiple tables, and dark-theme previews remain separate', async ({ page }, testInfo) => {
		const doc = tableDoc + '\n\n| Norm | Value |\n| --- | --- |\n| $\\lVert x\\rVert$ | $x\\|y$ |';
		await mount(page, doc, { dark: true });
		await expect(page.locator('.cm-tw')).toHaveCount(2);
		await expect(page.locator('.cm-tw').nth(1).locator('.katex')).toHaveCount(2);
		await expect(page.locator('.cm-tw').nth(1).locator('annotation').nth(1)).toHaveText('x|y');
		await expect(page.locator('.cm-tw th').first()).toHaveCSS('background-color', 'rgb(51, 51, 51)');
		await expect(page.locator('.cm-tw th .katex').first()).toHaveCSS('color', 'rgb(238, 238, 238)');
		await page.screenshot({ path: testInfo.outputPath('native-table-dark.png') });
		expect(await readDoc(page)).toBe(doc);
	});
});
