import { Compartment, EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { liveMathClickHandler, mathDecorationsField } from '../../src/mathDecorations';
import { nativeTableMath } from '../../src/nativeTableMath';
import { renderTableMath } from '../../src/tableMathRendering';
const renderNativeTables = require('joplin-native-tables').default;
declare const __NATIVE_TABLES_AVAILABLE__: boolean;

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
		nativeTablesAvailable: boolean;
		setLiveMathEnabled: (enabled: boolean) => void;
		renderTableCell: (source: string) => HTMLElement | null;
		mountMathEditor: (options: { doc: string; dark?: boolean; tables?: boolean; readOnly?: boolean }) => void;
	}
}

window.nativeTablesAvailable = __NATIVE_TABLES_AVAILABLE__;
window.renderTableCell = source => renderTableMath(source, document);
window.mountMathEditor = ({ doc, dark = false, tables = false, readOnly = false }) => {
	window.mathEditor?.destroy();
	const math = new Compartment();
	const extensions = [mathDecorationsField, liveMathClickHandler, nativeTableMath];
	window.mathEditor = new EditorView({
		parent: document.body,
		state: EditorState.create({
			doc,
			extensions: [
				EditorState.readOnly.of(readOnly),
				tables ? renderNativeTables({ openLink: () => {} }) : [],
				EditorView.lineWrapping,
				// Match Joplin's native quote line style, including its theme-dependent color.
				EditorView.theme({
					'&': {
						fontSize: '16px', backgroundColor: dark ? '#202020' : '#ffffff', color: dark ? '#eeeeee' : '#202020',
						'--joplin-color': dark ? '#eeeeee' : '#202020',
						'--joplin-background-color3': dark ? '#333333' : '#f0f0f0',
						'--joplin-divider-color': dark ? '#666666' : '#dddddd',
					},
					'& .cm-blockQuote': { borderLeft: `4px solid ${dark ? '#a0a0a0' : '#777777'}`, opacity: '0.8', paddingLeft: '4px' },
				}, { dark }),
				quoteLineField,
				math.of(extensions),
			],
		}),
	});
	window.setLiveMathEnabled = enabled => window.mathEditor.dispatch({ effects: math.reconfigure(enabled ? extensions : []) });
};
