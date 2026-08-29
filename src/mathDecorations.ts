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
		if (selectionTouchesExpression(state, expression)) {
			if (expression.block) {
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
					expression.displayMode,
					expression.contentFrom,
					expression.contentTo
				),
				block: expression.block,
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
