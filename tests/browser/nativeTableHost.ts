import { Facet, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { parser, Table } from '@lezer/markdown';

// Host shims only: the table widget, model, keyboard, focus, and timers under test
// come from the checksum-pinned upstream Joplin source downloaded separately.
export const editorSettingsFacet = Facet.define({ combine: () => ({ preferMacShortcuts: false }) });
export const getSearchQuery = () => ({ search: '', valid: true });
export const searchPanelOpen = () => false;
export const focus = (_reason: string, target: HTMLElement) => target.focus({ preventScroll: true });
export const blur = (_reason: string, target: HTMLElement) => target.blur();
export const getCellContentPosition = (state: EditorState, range: { from: number }, row: number) =>
	state.doc.line(state.doc.lineAt(range.from).number + row + (row > 0 ? 1 : 0)).from;

export default function makeBlockReplaceExtension(options: any) {
	const build = (state: EditorState) => {
		const ranges: any[] = [];
		parser.configure(Table).parse(state.doc.toString()).iterate({ enter: node => {
			const widget = options.createDecoration(node, state);
			if (!widget) return;
			const [from, to] = options.getDecorationRange(node, state);
			ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
		} });
		return Decoration.set(ranges, true);
	};
	return StateField.define({
		create: build,
		update: (value, transaction) => transaction.docChanged || transaction.reconfigured ? build(transaction.state) : value,
		provide: field => EditorView.decorations.from(field),
	});
}
