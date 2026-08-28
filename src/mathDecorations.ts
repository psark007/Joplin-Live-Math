import { EditorState, Facet, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { findMathExpressions, type MathExpression } from './mathParser';
import { MathWidget } from './mathWidget';

interface MathDecorationState {
	decorations: DecorationSet;
}

export const liveMathEnabledFacet = Facet.define<boolean, boolean>({
	combine: values => values.length === 0 ? true : values[values.length - 1],
});

export const liveMathLoadedAttribute = EditorView.editorAttributes.of({
	'data-joplin-live-math': 'loaded',
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

const buildMathDecorations = (state: EditorState): MathDecorationState => {
	if (!state.facet(liveMathEnabledFacet)) {
		return { decorations: Decoration.none };
	}

	const builder = new RangeSetBuilder<Decoration>();
	const expressions = findMathExpressions(state.doc.toString());

	for (const expression of expressions) {
		if (selectionTouchesExpression(state, expression)) {
			if (expression.kind === 'display') {
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
				widget: new MathWidget(expression.source, expression.kind === 'display'),
				block: expression.kind === 'display',
			})
		);
	}

	return { decorations: builder.finish() };
};

export const mathDecorationsField = StateField.define<MathDecorationState>({
	create: buildMathDecorations,
	update: (value, transaction) => {
		if (transaction.docChanged || transaction.selection || transaction.reconfigured) {
			return buildMathDecorations(transaction.state);
		}

		return value;
	},
	provide: field => EditorView.decorations.from(field, value => value.decorations),
});
