import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { liveMathClickHandler, mathDecorationsField } from '../../src/mathDecorations';

const quoteLines = (state: EditorState) => {
	const builder = new RangeSetBuilder<Decoration>();
	for (let number = 1; number <= state.doc.lines; number += 1) {
		const line = state.doc.line(number);
		if (/^[ \t]*>/.test(line.text)) {
			builder.add(line.from, line.from, Decoration.line({ class: 'cm-blockQuote' }));
		}
	}
	return builder.finish();
};

const quoteLineField = StateField.define({
	create: quoteLines,
	update: (value, transaction) => transaction.docChanged ? quoteLines(transaction.state) : value,
	provide: field => EditorView.decorations.from(field),
});

declare global {
	interface Window {
		mathEditor: EditorView;
		mountMathEditor: (options: { doc: string; dark?: boolean }) => void;
	}
}

window.mountMathEditor = ({ doc, dark = false }) => {
	window.mathEditor?.destroy();
	window.mathEditor = new EditorView({
		parent: document.body,
		state: EditorState.create({
			doc,
			extensions: [
				EditorView.lineWrapping,
				// Match Joplin's native quote line style, including its theme-dependent color.
				EditorView.theme({
					'&': { fontSize: '16px', backgroundColor: dark ? '#202020' : '#ffffff', color: dark ? '#eeeeee' : '#202020' },
					'& .cm-blockQuote': { borderLeft: `4px solid ${dark ? '#a0a0a0' : '#777777'}`, opacity: '0.8', paddingLeft: '4px' },
				}, { dark }),
				quoteLineField,
				mathDecorationsField,
				liveMathClickHandler,
			],
		}),
	});
};
