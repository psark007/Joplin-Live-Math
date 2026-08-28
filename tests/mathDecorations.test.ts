import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { liveMathEnabledFacet, mathDecorationsField } from '../src/mathDecorations';

const collectDecorations = (doc: string, anchor: number) => {
	const state = EditorState.create({
		doc,
		selection: { anchor },
		extensions: [
			liveMathEnabledFacet.of(true),
			mathDecorationsField,
		],
	});
	const ranges: Array<{ from: number; to: number; hasWidget: boolean; className?: string }> = [];

	const decorationSet = state.field(mathDecorationsField).decorations;

	decorationSet.between(0, state.doc.length, (from: number, to: number, value: any) => {
		ranges.push({
			from,
			to,
			hasWidget: !!value.spec.widget,
			className: value.spec.class,
		});
	});

	return ranges;
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
});
