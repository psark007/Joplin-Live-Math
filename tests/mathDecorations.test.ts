import { EditorState, Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { findMathExpressions } from '../src/mathParser';
import { liveMathEnabledFacet, mathDecorationsField, mathSourceForCopy } from '../src/mathDecorations';

interface DecoratedRange {
	from: number;
	to: number;
	hasWidget: boolean;
	block: boolean;
	blockQuote: boolean;
	indentColumns: number;
	katexDisplayMode: boolean;
	className?: string;
}

const collectFromState = (state: EditorState): DecoratedRange[] => {
	const ranges: DecoratedRange[] = [];

	const decorationSet = state.field(mathDecorationsField).decorations;

	decorationSet.between(0, state.doc.length, (from: number, to: number, value: any) => {
		const widget = value.spec.widget as any;

		ranges.push({
			from,
			to,
			hasWidget: !!widget,
			block: value.spec.block === true,
			blockQuote: widget?.blockQuote ?? false,
			indentColumns: widget?.indentColumns ?? 0,
			katexDisplayMode: widget?.katexDisplayMode ?? false,
			className: value.spec.class,
		});
	});

	return ranges;
};

const collectDecorations = (doc: string, anchor: number) => {
	const state = EditorState.create({
		doc,
		selection: { anchor },
		extensions: [
			liveMathEnabledFacet.of(true),
			mathDecorationsField,
		],
	});

	return collectFromState(state);
};

describe('math decorations', () => {
	it('renders inline math when the cursor is before the expression', () => {
		expect(collectDecorations('A $x^2$ B', 1)).toEqual([
			expect.objectContaining({ from: 2, to: 7, hasWidget: true, katexDisplayMode: false }),
		]);
	});

	it('renders inline math when the cursor is after the expression', () => {
		expect(collectDecorations('A $x^2$ B', 8)).toEqual([
			expect.objectContaining({ from: 2, to: 7, hasWidget: true, katexDisplayMode: false }),
		]);
	});

	it('keeps inline source open when the cursor is on an expression boundary', () => {
		expect(collectDecorations('A $x^2$ B', 2)).toEqual([
			expect.objectContaining({
				from: 2,
				to: 7,
				hasWidget: false,
				className: 'joplin-live-math-source-inline',
			}),
		]);

		expect(collectDecorations('A $x^2$ B', 7)).toEqual([
			expect.objectContaining({
				from: 2,
				to: 7,
				hasWidget: false,
				className: 'joplin-live-math-source-inline',
			}),
		]);
	});

	it('reveals inline source when the cursor is inside the expression', () => {
		expect(collectDecorations('A $x^2$ B', 4)).toEqual([
			expect.objectContaining({
				from: 2,
				to: 7,
				hasWidget: false,
				className: 'joplin-live-math-source-inline',
			}),
		]);
	});

	it('uses block layout for top-level display math', () => {
		expect(collectDecorations('$$\nx^2\n$$', 9)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 0, katexDisplayMode: true }),
		]);
	});

	it('uses block layout for top-level multiline display math with content beside delimiters', () => {
		const doc = String.raw`$$L = \begin{pmatrix}
x & y
\end{pmatrix}$$`;

		expect(collectDecorations(doc, doc.length)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 0, katexDisplayMode: true }),
		]);
	});

	it('uses display-style KaTeX for tagged pmatrix display math', () => {
		const doc = [
			'$$',
			String.raw`x_\varepsilon(t)=`,
			String.raw`\begin{pmatrix}`,
			String.raw`tI_3+i\varepsilon h(t)D`,
			'&',
			String.raw`i\left(I_3+\varepsilon h(t)(X+2I_3)\right)`,
			String.raw`\\[2mm]`,
			String.raw`i\left(I_3+\varepsilon h(t)(X+2I_3)\right)`,
			'&',
			String.raw`2I_3`,
			String.raw`\end{pmatrix}.`,
			String.raw`\tag{1}`,
			'$$',
		].join('\n');

		expect(collectDecorations(doc, 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 0, katexDisplayMode: true }),
		]);
	});

	it('keeps block math visually indented inside a bullet list', () => {
		// Even though this math is only "list-contained" (not top-level) as far
		// as styling intent goes, CodeMirror requires block:true for any
		// replace decoration whose range crosses a line break -- marking it
		// block:false here would silently misposition the rendered widget.
		expect(collectDecorations('- $$\n  x^2\n  $$', 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 2 }),
		]);
	});

	it('keeps block math visually indented inside a numbered list', () => {
		expect(collectDecorations('1. $$\n   x^2\n   $$', 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 3 }),
		]);
	});

	it('uses block layout for blockquote-contained multiline display math', () => {
		const doc = [
			String.raw`> $$L = \begin{pmatrix}`,
			'> x & y',
			String.raw`> \end{pmatrix}$$`,
		].join('\n');

		expect(collectDecorations(doc, 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, indentColumns: 2 }),
		]);
	});

	it('uses inline layout and KaTeX display style for same-line double-dollar math', () => {
		expect(collectDecorations('> An equation $$ x^2 $$ here', 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: false, indentColumns: 0, katexDisplayMode: true }),
		]);
	});

	it.each([
		'> $$\n> x^2\n> $$',
		'  >> $$\n  >> x^2\n  >> $$',
		'> - $$\n>   x^2\n>   $$',
	])('preserves the quote context on a multiline math widget: %s', doc => {
		expect(collectDecorations(doc, 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true, blockQuote: true }),
		]);
	});

	it.each([
		'> Inline $x^2$ here',
		'> Same-line $$x^2$$ here',
		'- $$\n  x^2\n  $$',
		'1. $$\n   x^2\n   $$',
		'$$\nx\n> 0\n$$',
	])('does not add a quote bar to inline or non-quoted math: %s', doc => {
		expect(collectDecorations(doc, 0)).toEqual([
			expect.objectContaining({ hasWidget: true, blockQuote: false }),
		]);
	});

	it('copies full math source when the cursor is inside an expression', () => {
		const doc = 'A $x^2$ B';
		const state = EditorState.create({
			doc,
			selection: { anchor: 4 },
		});

		expect(mathSourceForCopy(state, findMathExpressions(doc))).toBe('$x^2$');
	});

	it('copies selected document text when a selection overlaps math', () => {
		const doc = 'A $x^2$ B';
		const state = EditorState.create({
			doc,
			selection: { anchor: 0, head: 8 },
		});

		expect(mathSourceForCopy(state, findMathExpressions(doc))).toBe('A $x^2$ ');
	});

	it('does not intercept copy when the selection does not touch math', () => {
		const doc = 'A $x^2$ B';
		const state = EditorState.create({
			doc,
			selection: { anchor: 0, head: 1 },
		});

		expect(mathSourceForCopy(state, findMathExpressions(doc))).toBeNull();
	});

	it('keeps display source open when pointer selection starts on a closing boundary', () => {
		const doc = '$$\nx^2\n$$';
		const state = EditorState.create({
			doc,
			selection: { anchor: 0 },
			extensions: [
				liveMathEnabledFacet.of(true),
				mathDecorationsField,
			],
		});

		const next = state.update({
			selection: { anchor: doc.length },
			annotations: Transaction.userEvent.of('select.pointer'),
		});

		expect(collectFromState(next.state)).toEqual([
			expect.objectContaining({
				from: 0,
				hasWidget: false,
				className: 'joplin-live-math-source-line',
			}),
			expect.objectContaining({
				from: 3,
				hasWidget: false,
				className: 'joplin-live-math-source-line',
			}),
			expect.objectContaining({
				from: 7,
				hasWidget: false,
				className: 'joplin-live-math-source-line',
			}),
		]);
	});

	it('reveals inline source when the cursor moves inside via a transaction', () => {
		const state = EditorState.create({
			doc: 'A $x^2$ B',
			selection: { anchor: 1 },
			extensions: [
				liveMathEnabledFacet.of(true),
				mathDecorationsField,
			],
		});

		// Cursor outside the expression: the widget is rendered.
		expect(collectFromState(state)).toEqual([
			expect.objectContaining({ from: 2, to: 7, hasWidget: true }),
		]);

		// Move the cursor inside; the selection-only update must swap the widget
		// for the highlighted source without re-parsing the document.
		const next = state.update({ selection: { anchor: 4 } });

		expect(collectFromState(next.state)).toEqual([
			expect.objectContaining({
				from: 2,
				to: 7,
				hasWidget: false,
				className: 'joplin-live-math-source-inline',
			}),
		]);
	});

	it('never marks a widget decoration block:false when its range crosses a line break', () => {
		// Regression guard: CodeMirror's Decoration.replace requires block:true
		// whenever the decorated range spans a line break, regardless of the
		// parser's own styling-only "block"/"displayMode" flags. Violating this
		// doesn't throw -- it silently mispositions the rendered widget -- so
		// this is checked explicitly rather than relying on a thrown error.
		const docs = [
			'- $$\n  x^2\n  $$',
			'1. $$\n   x^2\n   $$',
			['> $$L = \\begin{pmatrix}', '> x & y', '> \\end{pmatrix}$$'].join('\n'),
			'$$\nx^2\n$$',
		];

		for (const doc of docs) {
			const decorations = collectDecorations(doc, 0);
			for (const decoration of decorations.filter(d => d.hasWidget)) {
				const [from, to] = [decoration.from, decoration.to];
				const state = EditorState.create({ doc });
				const crossesLineBreak = state.doc.lineAt(from).number !==
					state.doc.lineAt(Math.max(from, to - 1)).number;

				if (crossesLineBreak) {
					expect(decoration.block).toBe(true);
				}
			}
		}
	});
});
