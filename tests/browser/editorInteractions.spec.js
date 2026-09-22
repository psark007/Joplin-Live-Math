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

const pointAt = (page, position) => page.evaluate(position => {
	const bounds = window.mathEditor.coordsAtPos(position);
	return { x: bounds.left, y: (bounds.top + bounds.bottom) / 2 };
}, position);

const copiedSelection = page => page.evaluate(() => {
	const view = window.mathEditor;
	const data = new DataTransfer();
	view.contentDOM.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
	return {
		text: data.getData('text/plain'),
		anchor: view.state.selection.main.anchor,
		head: view.state.selection.main.head,
	};
});

const dragDoc = 'Start here\n\n$$\na +\nb +\nc +\nd +\ne +\nf\n$$\n\nFinish here\n\nTrailing text';

for (const direction of ['forwards', 'backwards']) {
	for (const revealed of [false, true]) {
		test(`dragging ${direction} across ${revealed ? 'source' : 'rendered math'} keeps the layout and copies exact text`, async ({ page }, testInfo) => {
			await page.evaluate(doc => window.mountMathEditor({ doc }), dragDoc);
			if (revealed) await page.locator('.joplin-live-math-display').click();
			const from = 3;
			const to = dragDoc.indexOf('Finish') + 6;
			const anchor = direction === 'forwards' ? from : to;
			const head = direction === 'forwards' ? to : from;
			const start = await pointAt(page, anchor);
			const end = await pointAt(page, head);
			const targetBefore = await pointAt(page, to);
			await page.mouse.move(start.x, start.y);
			await page.mouse.down();
			expect(await pointAt(page, to)).toEqual(targetBefore);
			await page.mouse.move(end.x, end.y, { steps: 20 });
			expect(await pointAt(page, to)).toEqual(targetBefore);
			await expect(page.locator('.joplin-live-math-display')).toHaveCount(revealed ? 0 : 1);
			if (!revealed && direction === 'forwards') {
				await page.screenshot({ path: testInfo.outputPath('drag-selection.png') });
			}
			await page.mouse.up();
			await expect(page.locator('.joplin-live-math-source-line')).toHaveCount(8);
			expect(await copiedSelection(page)).toEqual({ anchor, head, text: dragDoc.slice(from, to) });
		});
	}
}

test('a drag across an inline widget is not collapsed by its click handler', async ({ page }) => {
	await page.evaluate(() => window.mountMathEditor({ doc: 'Before $x+y+z$ after' }));
	const bounds = await page.locator('.joplin-live-math-inline').boundingBox();
	await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await expect(page.locator('.joplin-live-math-inline')).toHaveCount(1);
	await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2, { steps: 10 });
	await page.mouse.up();
	await expect.poll(async () => (await copiedSelection(page)).text).toBe('$x+y+z$');
	expect(await copiedSelection(page)).toEqual({ anchor: 14, head: 7, text: '$x+y+z$' });
});

for (const prefix of ['', '- ', '> ']) {
	test(`click coordinates stay accurate after several display equations (${prefix || 'plain'})`, async ({ page }) => {
		const block = `${prefix}$$\n${prefix}x+y\n${prefix}$$`;
		const doc = `Before\n\n${block}\n\n${block}\n\n${block}\n\nTarget text`;
		await page.evaluate(async doc => {
			window.mountMathEditor({ doc });
			await document.fonts.ready;
		}, doc);
		const position = doc.indexOf('Target') + 3;
		const point = await pointAt(page, position);
		expect(await page.evaluate(point => window.mathEditor.posAtCoords(point), point)).toBe(position);
		await page.mouse.click(point.x, point.y);
		expect(await page.evaluate(() => window.mathEditor.state.selection.main.head)).toBe(position);
	});
}

test('dragging backwards within multiline source copies a partial expression', async ({ page }) => {
	await page.evaluate(doc => window.mountMathEditor({ doc }), dragDoc);
	await page.locator('.joplin-live-math-display').click();
	const anchor = dragDoc.indexOf('f\n$$') + 1;
	const head = dragDoc.indexOf('a +');
	const start = await pointAt(page, anchor);
	const end = await pointAt(page, head);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 15 });
	await page.mouse.up();
	expect(await copiedSelection(page)).toEqual({ anchor, head, text: dragDoc.slice(head, anchor) });
});

test('shift-clicking math extends the selection instead of opening a cursor inside it', async ({ page }) => {
	await page.evaluate(() => window.mountMathEditor({ doc: 'Before $x+y+z$ after' }));
	await page.locator('.joplin-live-math-inline').click({ modifiers: ['Shift'] });
	const selection = await copiedSelection(page);
	expect(selection.anchor).toBe(0);
	expect(selection.head).toBeGreaterThanOrEqual(7);
	expect(await page.evaluate(() => window.mathEditor.state.selection.main.empty)).toBe(false);
});

for (const ending of ['outside release', 'window blur', 'missed mouseup']) {
	test(`rendering resumes after ${ending}`, async ({ page }) => {
		await page.evaluate(doc => window.mountMathEditor({ doc }), dragDoc);
		const start = await pointAt(page, 3);
		const end = await pointAt(page, dragDoc.indexOf('Finish') + 6);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(end.x, end.y, { steps: 10 });
		await expect(page.locator('.joplin-live-math-display')).toHaveCount(1);
		if (ending === 'outside release') {
			await page.mouse.move(2, 600);
			await page.mouse.up();
		} else if (ending === 'window blur') {
			await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		} else {
			await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { buttons: 0 })));
		}
		await expect(page.locator('.joplin-live-math-source-line')).toHaveCount(8);
		if (ending !== 'outside release') await page.mouse.up();
		await page.evaluate(() => window.mathEditor.dispatch({ selection: { anchor: 0 } }));
		await expect(page.locator('.joplin-live-math-display')).toHaveCount(1);
	});
}

test('destroying an editor during a drag removes its gesture listeners', async ({ page }) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.evaluate(doc => window.mountMathEditor({ doc }), dragDoc);
	const start = await pointAt(page, 3);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.evaluate(doc => window.mountMathEditor({ doc }), dragDoc);
	await page.mouse.move(20, 600);
	await page.mouse.up();
	await page.locator('.joplin-live-math-display').click();
	await expect(page.locator('.joplin-live-math-source-line')).toHaveCount(8);
	expect(errors).toEqual([]);
});
