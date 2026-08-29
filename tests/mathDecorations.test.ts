import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { liveMathEnabledFacet, mathDecorationsField } from '../src/mathDecorations';

interface DecoratedRange {
	from: number;
	to: number;
	hasWidget: boolean;
	block: boolean;
	className?: string;
}

const collectFromState = (state: EditorState): DecoratedRange[] => {
	const ranges: DecoratedRange[] = [];

	const decorationSet = state.field(mathDecorationsField).decorations;

	decorationSet.between(0, state.doc.length, (from: number, to: number, value: any) => {
		ranges.push({
			from,
			to,
			hasWidget: !!value.spec.widget,
			block: value.spec.block === true,
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
		expect(collectDecorations('A $x^2$ B', 2)).toEqual([
			expect.objectContaining({ from: 2, to: 7, hasWidget: true }),
		]);
	});

	it('renders inline math when the cursor is after the expression', () => {
		expect(collectDecorations('A $x^2$ B', 7)).toEqual([
			expect.objectContaining({ from: 2, to: 7, hasWidget: true }),
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
			expect.objectContaining({ hasWidget: true, block: true }),
		]);
	});

	it('uses block layout for top-level multiline display math with content beside delimiters', () => {
		const doc = String.raw`$$L = \begin{pmatrix}
x & y
\end{pmatrix}$$`;

		expect(collectDecorations(doc, doc.length)).toEqual([
			expect.objectContaining({ hasWidget: true, block: true }),
		]);
	});

	it('uses inline layout for list-contained display math', () => {
		expect(collectDecorations('- $$\n  x^2\n  $$', 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: false }),
		]);
	});

	it('uses inline layout for same-line double-dollar math', () => {
		expect(collectDecorations('> An equation $$ x^2 $$ here', 0)).toEqual([
			expect.objectContaining({ hasWidget: true, block: false }),
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
});
