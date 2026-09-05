import { EditorState, Facet, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { findMathExpressions, type MathExpression } from './mathParser';
import { MathWidget } from './mathWidget';

interface MathDecorationState {
	expressions: MathExpression[];
	decorations: DecorationSet;
}

export const liveMathEnabledFacet = Facet.define<boolean, boolean>({
	combine: values => values.length === 0 ? true : values[values.length - 1],
});

export const liveMathLoadedAttribute = EditorView.editorAttributes.of({
	'data-joplin-live-math': 'loaded',
});

const mathWidgetSelector = '[data-joplin-live-math-widget="true"]';

const readPositionAttribute = (element: Element, name: string): number | null => {
	const value = element.getAttribute(name);
	if (value === null) {
		return null;
	}

	const position = Number(value);
	return Number.isInteger(position) && position >= 0 ? position : null;
};

const clickPositionInExpression = (event: MouseEvent, element: Element, contentFrom: number, contentTo: number) => {
	if (contentTo <= contentFrom) {
		return contentFrom;
	}

	const bounds = element.getBoundingClientRect();
	if (bounds.width <= 0) {
		return contentFrom;
	}

	const clickRatio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
	return Math.round(contentFrom + ((contentTo - contentFrom) * clickRatio));
};

export const liveMathClickHandler = EditorView.domEventHandlers({
	mousedown: (event, view) => {
		if (event.button !== 0 || !(event.target instanceof Element)) {
			return false;
		}

		const widget = event.target.closest(mathWidgetSelector);
		if (!widget || !view.dom.contains(widget)) {
			return false;
		}

		const contentFrom = readPositionAttribute(widget, 'data-joplin-live-math-content-from');
		const contentTo = readPositionAttribute(widget, 'data-joplin-live-math-content-to');
		if (contentFrom === null || contentTo === null) {
			return false;
		}

		event.preventDefault();
		view.focus();
		view.dispatch({
			selection: {
				anchor: clickPositionInExpression(event, widget, contentFrom, contentTo),
			},
			scrollIntoView: true,
		});

		return true;
	},
});

const selectionTouchesExpression = (state: EditorState, expression: MathExpression): boolean => {
	for (const range of state.selection.ranges) {
		if (range.empty) {
			if (range.from > expression.from && range.from < expression.to) {
				return true;
			}

			continue;
		}

		if (range.from < expression.to && range.to > expression.from) {
			return true;
		}
	}

	return false;
};

// CodeMirror requires that any `Decoration.replace` (or `Decoration.mark`,
// for the purposes of picking a reveal style below) whose range crosses a
// hard line break be treated as a block-level decoration. Our parser's
// `block`/`displayMode` fields describe *styling intent* (should this look
// like a centred, top-level display block, e.g. based on whether it's
// nested inside a list item or blockquote) -- that's a different question
// from whether the range is structurally allowed to be inline. An
// expression sitting inside a list item can still span multiple physical
// lines (open "$$" line, content line(s), close "$$" line), and marking
// that kind of range as an inline (`block: false`) replace decoration is
// invalid: CodeMirror renders each line as its own DOM node, so an inline
// element cannot stretch across several of them. Doing so anyway doesn't
// throw, but silently produces mispositioned/overlapping output -- the
// widget effectively anchors at the start of the line box, ignoring the
// list/blockquote indentation, instead of flowing after the marker.
//
// So: always force `block: true` when the range crosses a line break,
// regardless of the parser's styling-only `block` flag.
const spansMultipleLines = (state: EditorState, expression: MathExpression): boolean => {
	const to = Math.max(expression.from, expression.to - 1);
	return state.doc.lineAt(expression.from).number !== state.doc.lineAt(to).number;
};

const visualColumns = (text: string): number => {
	let columns = 0;

	for (const character of text) {
		if (character === '\t') {
			columns += 4 - (columns % 4);
		} else {
			columns += 1;
		}
	}

	return columns;
};

const blockIndentColumns = (
	state: EditorState,
	expression: MathExpression,
	mustRenderAsBlock: boolean
): number => {
	if (!mustRenderAsBlock) {
		return 0;
	}

	const line = state.doc.lineAt(expression.from);
	return visualColumns(line.text.slice(0, expression.from - line.from));
};

const addDisplaySourceLineDecorations = (
	state: EditorState,
	expression: MathExpression,
	builder: RangeSetBuilder<Decoration>
) => {
	let position = expression.from;

	while (position <= expression.to) {
		const line = state.doc.lineAt(position);
		builder.add(line.from, line.from, Decoration.line({ class: 'joplin-live-math-source-line' }));

		if (line.to >= expression.to || line.to === state.doc.length) {
			break;
		}

		position = line.to + 1;
	}
};

const buildDecorations = (state: EditorState, expressions: MathExpression[]): DecorationSet => {
	if (!state.facet(liveMathEnabledFacet)) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();

	for (const expression of expressions) {
		// Structural requirement (see `spansMultipleLines` above) -- distinct
		// from `expression.block`/`expression.displayMode`, which only capture
		// styling intent.
		const mustRenderAsBlock = expression.block || spansMultipleLines(state, expression);

		if (selectionTouchesExpression(state, expression)) {
			if (mustRenderAsBlock) {
				addDisplaySourceLineDecorations(state, expression, builder);
			} else {
				builder.add(
					expression.from,
					expression.to,
					Decoration.mark({ class: 'joplin-live-math-source-inline' })
				);
			}

			continue;
		}

		builder.add(
			expression.from,
			expression.to,
			Decoration.replace({
				widget: new MathWidget(
					expression.source,
					expression.displayMode || mustRenderAsBlock,
					expression.contentFrom,
					expression.contentTo,
					blockIndentColumns(state, expression, mustRenderAsBlock)
				),
				block: mustRenderAsBlock,
			})
		);
	}

	return builder.finish();
};

const parseExpressions = (state: EditorState): MathExpression[] =>
	findMathExpressions(state.doc.toString());

const recompute = (state: EditorState): MathDecorationState => {
	if (!state.facet(liveMathEnabledFacet)) {
		return { expressions: [], decorations: Decoration.none };
	}

	const expressions = parseExpressions(state);
	return { expressions, decorations: buildDecorations(state, expressions) };
};

export const mathDecorationsField = StateField.define<MathDecorationState>({
	create: recompute,
	update: (value, transaction) => {
		if (transaction.docChanged) {
			return recompute(transaction.state);
		}

		if (transaction.selection) {
			// The document is unchanged, so the parsed expressions (and their
			// absolute positions) are still valid. Only the selection-sensitive
			// source-vs-widget decision needs recomputing, so skip re-parsing.
			return {
				expressions: value.expressions,
				decorations: buildDecorations(transaction.state, value.expressions),
			};
		}

		if (transaction.reconfigured) {
			return recompute(transaction.state);
		}

		return value;
	},
	provide: field => EditorView.decorations.from(field, value => value.decorations),
});
