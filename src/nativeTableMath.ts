import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { renderTableMath, tableCellSources } from './tableMathRendering';

const sourceSelector = '.cm-tw[data-from][data-to] .cm-tw-text';
const hiddenSourceClass = 'joplin-live-math-table-source-hidden';

interface CellPreview {
	source: string;
	preview: HTMLElement;
}

class NativeTableMath {
	private readonly cells = new Map<HTMLElement, CellPreview>();
	private readonly editedSources = new WeakMap<HTMLElement, string>();
	private readonly tables = new WeakMap<HTMLElement, { source: string; rows: string[][] | null }>();
	private readonly document: Document;
	private readonly window: Window & typeof globalThis;
	private readonly observer: MutationObserver;
	private frame: number | null = null;
	private destroyed = false;

	public constructor(private readonly view: EditorView) {
		this.document = view.dom.ownerDocument;
		this.window = this.document.defaultView!;
		this.observer = new this.window.MutationObserver(this.schedule);
		this.observe();
		view.dom.addEventListener('focus', this.focus, true);
		view.dom.addEventListener('blur', this.blur, true);
		view.dom.addEventListener('copy', this.copy);
		this.schedule();
	}

	private observe(): void {
		this.observer.observe(this.view.contentDOM, { childList: true, subtree: true, characterData: true });
	}

	private schedule = (): void => {
		if (this.destroyed || this.frame !== null) return;
		this.frame = this.window.requestAnimationFrame(() => {
			this.frame = null;
			this.refresh();
		});
	};

	private focus = (event: FocusEvent): void => {
		const source = event.target;
		if (!(source instanceof this.window.HTMLElement)) return;
		const cell = this.cells.get(source);
		if (!cell) return;
		// Run before the native onfocus handler restores its own raw Markdown.
		source.classList.remove(hiddenSourceClass);
		cell.preview.hidden = true;
		this.view.requestMeasure();
	};

	private blur = (event: FocusEvent): void => {
		const source = event.target;
		if (!(source instanceof this.window.HTMLElement) || !source.matches(sourceSelector)) return;
		// Joplin may defer saving when moving between cells. Read raw text before
		// native blur rendering, without changing the editable element or its model.
		this.editedSources.set(source, source.textContent ?? '');
		this.schedule();
	};

	private copy = (event: ClipboardEvent): void => {
		const selection = this.document.getSelection();
		if (!event.clipboardData || !selection?.rangeCount || selection.isCollapsed) return;
		const range = selection.getRangeAt(0);
		for (const { preview, source } of this.cells.values()) {
			if (preview.hidden || !preview.contains(selection.anchorNode) || !preview.contains(selection.focusNode)) continue;
			if (!Array.from(preview.querySelectorAll('.katex')).some(math => range.intersectsNode(math))) return;
			event.clipboardData.setData('text/plain', source);
			event.preventDefault();
			event.stopPropagation();
			return;
		}
	};

	private remove(source: HTMLElement): void {
		this.cells.get(source)?.preview.remove();
		source.classList.remove(hiddenSourceClass);
		this.cells.delete(source);
	}

	private refresh(): void {
		this.observer.disconnect();
		let changed = false;
		const seen = new Set<HTMLElement>();
		try {
			for (const container of Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-tw[data-from][data-to]'))) {
				const from = Number(container.dataset.from), to = Number(container.dataset.to);
				if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > this.view.state.doc.length) continue;
				const table = container.querySelector<HTMLTableElement>(':scope > table');
				if (!table) continue;
				const source = this.view.state.sliceDoc(from, to);
				let parsed = this.tables.get(container);
				if (parsed?.source !== source) {
					parsed = { source, rows: tableCellSources(source) };
					this.tables.set(container, parsed);
				}
				const rows = parsed.rows;
				// Fail closed if a future native widget no longer matches this structure.
				if (!rows || rows.length !== table.rows.length || Array.from(table.rows).some(row => row.cells.length !== rows[0].length)) continue;
				Array.from(table.rows).forEach((row, r) => Array.from(row.cells).forEach((cell, c) => {
					const editor = cell.querySelector<HTMLElement>(':scope > .cm-tw-text');
					if (!editor) return;
					seen.add(editor);
					if (this.document.activeElement === editor) return;
					const cellSource = this.editedSources.get(editor) ?? rows[r][c];
					let record = this.cells.get(editor);
					if (!record || record.source !== cellSource) {
						const preview = renderTableMath(cellSource, this.document);
						if (record) { this.remove(editor); changed = true; }
						if (!preview) return;
						preview.addEventListener('click', event => {
							if (event.button !== 0 || event.detail > 1 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey ||
								!this.document.getSelection()?.isCollapsed || editor.contentEditable !== 'true') return;
							editor.classList.remove(hiddenSourceClass);
							preview.hidden = true;
							editor.focus();
						});
						cell.insertBefore(preview, editor.nextSibling);
						record = { source: cellSource, preview };
						this.cells.set(editor, record);
						changed = true;
					}
					if (record.preview.hidden || !editor.classList.contains(hiddenSourceClass)) changed = true;
					record.preview.hidden = false;
					editor.classList.add(hiddenSourceClass);
				}));
			}
			for (const editor of this.cells.keys()) {
				if (!seen.has(editor)) { this.remove(editor); changed = true; }
			}
		} finally {
			this.observe();
			if (changed) this.view.requestMeasure();
		}
	}

	public update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged || update.transactions.some(transaction => transaction.reconfigured)) this.schedule();
	}

	public destroy(): void {
		this.destroyed = true;
		this.observer.disconnect();
		if (this.frame !== null) this.window.cancelAnimationFrame(this.frame);
		this.view.dom.removeEventListener('focus', this.focus, true);
		this.view.dom.removeEventListener('blur', this.blur, true);
		this.view.dom.removeEventListener('copy', this.copy);
		for (const source of this.cells.keys()) this.remove(source);
	}
}

export const nativeTableMath = ViewPlugin.fromClass(NativeTableMath);
