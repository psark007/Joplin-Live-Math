import { EditorState, Facet, type Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { findMathExpressions, type MathExpression } from './mathParser';
import { MathWidget } from './mathWidget';

interface MathDecorationState {
	expressions: MathExpression[];
	decorations: DecorationSet;
	pointerSelecting: boolean;
}

export const setMathPointerSelecting = StateEffect.define<boolean>();

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

export const mathSourceForCopy = (state: EditorState, expressions: MathExpression[]): string | null => {
	const copiedRanges: string[] = [];
	let touchesMath = false;

	for (const range of state.selection.ranges) {
		if (range.empty) {
			const expression = expressions.find(expression =>
				range.from >= expression.from && range.from <= expression.to
			);

			if (expression) {
				touchesMath = true;
				copiedRanges.push(state.sliceDoc(expression.from, expression.to));
			}

			continue;
		}

		if (expressions.some(expression => range.from < expression.to && range.to > expression.from)) {
			touchesMath = true;
		}

		copiedRanges.push(state.sliceDoc(range.from, range.to));
	}

	if (!touchesMath) {
		return null;
	}

	return copiedRanges.join('\n');
};

const rangeIntersectsNode = (range: globalThis.Range, node: Node): boolean => {
	try {
		return range.intersectsNode(node);
	} catch (error) {
		return false;
	}
};

const selectedWidgetSourceForCopy = (view: EditorView): string | null => {
	const selection = view.dom.ownerDocument.getSelection();
	if (!selection || selection.isCollapsed) {
		return null;
	}

	const selectedWidgets: { from: number; source: string }[] = [];
	const widgets = Array.from(view.dom.querySelectorAll(mathWidgetSelector));

	for (const widget of widgets) {
		let isSelected = false;

		for (let index = 0; index < selection.rangeCount; index += 1) {
			if (rangeIntersectsNode(selection.getRangeAt(index), widget)) {
				isSelected = true;
				break;
			}
		}

		if (!isSelected) {
			continue;
		}

		const from = readPositionAttribute(widget, 'data-joplin-live-math-from');
		const to = readPositionAttribute(widget, 'data-joplin-live-math-to');
		if (from === null || to === null || to <= from) {
			continue;
		}

		selectedWidgets.push({
			from,
			source: view.state.sliceDoc(from, to),
		});
	}

	if (selectedWidgets.length === 0) {
		return null;
	}

	return selectedWidgets
		.sort((left, right) => left.from - right.from)
		.map(widget => widget.source)
		.join('\n');
};

class MathPointerSelection {
	private startEvent: MouseEvent | null = null;
	private finishTimer: number | null = null;
	public dragged = false;
	private readonly document: Document;
	private readonly window: Window;

	public constructor(private readonly view: EditorView) {
		this.document = view.dom.ownerDocument;
		this.window = this.document.defaultView!;
	}

	public start(event: MouseEvent): void {
		if (event.button !== 0) return;
		this.clear();
		this.startEvent = event;
		this.dragged = false;
		this.document.addEventListener('mousemove', this.move);
		this.document.addEventListener('mouseup', this.finish);
		this.document.addEventListener('dragend', this.finish);
		this.window.addEventListener('blur', this.finish);
		// Freeze before CodeMirror applies the mousedown selection, which can hide source.
		this.view.dispatch({ effects: setMathPointerSelecting.of(true) });
	}

	private move = (event: MouseEvent): void => {
		if (this.startEvent && Math.max(
			Math.abs(event.clientX - this.startEvent.clientX),
			Math.abs(event.clientY - this.startEvent.clientY)
		) > 4) this.dragged = true;
		if ((event.buttons & 1) === 0) this.finish();
	};

	private finish = (): void => {
		if (!this.startEvent) return;
		this.clear();
		// Let CodeMirror finish mouseup and the following click before changing geometry.
		this.finishTimer = this.window.setTimeout(() => {
			this.finishTimer = null;
			if (this.view.state.field(mathDecorationsField, false)?.pointerSelecting) {
				this.view.dispatch({ effects: setMathPointerSelecting.of(false) });
			}
		}, 0);
	};

	private clear(): void {
		this.startEvent = null;
		this.document.removeEventListener('mousemove', this.move);
		this.document.removeEventListener('mouseup', this.finish);
		this.document.removeEventListener('dragend', this.finish);
		this.window.removeEventListener('blur', this.finish);
		if (this.finishTimer !== null) this.window.clearTimeout(this.finishTimer);
		this.finishTimer = null;
	}

	public update(update: ViewUpdate): void {
		if (update.docChanged) this.clear();
	}

	public destroy(): void {
		this.clear();
	}
}

export const liveMathClickHandler = ViewPlugin.fromClass(MathPointerSelection, {
	eventObservers: {
		mousedown(event) { this.start(event); },
	},
	eventHandlers: {
		click(event, view) {
			if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey ||
				event.detail > 1 || this.dragged || !view.state.selection.main.empty ||
				!(event.target instanceof Element)) {
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

			view.focus();
			view.dispatch({
				selection: {
					anchor: clickPositionInExpression(event, widget, contentFrom, contentTo),
				},
				scrollIntoView: true,
			});

			return true;
		},
		copy(event, view) {
			if (!event.clipboardData) {
				return false;
			}

			const field = view.state.field(mathDecorationsField, false);
			if (!field) {
				return false;
			}

			const source = mathSourceForCopy(view.state, field.expressions) ??
				selectedWidgetSourceForCopy(view);
			if (source === null) {
				return false;
			}

			event.clipboardData.setData('text/plain', source);
			event.preventDefault();
			return true;
		},
	},
});

interface BuildDecorationOptions {
	revealBoundaryExpressions: boolean;
}

const defaultBuildDecorationOptions: BuildDecorationOptions = {
	revealBoundaryExpressions: false,
};

const selectionTouchesExpression = (
	state: EditorState,
	expression: MathExpression,
	options: BuildDecorationOptions
): boolean => {
	for (const range of state.selection.ranges) {
		if (range.empty) {
			if (range.from > expression.from && range.from < expression.to) {
				return true;
			}

			if (range.from >= expression.from && range.from <= expression.to &&
				(expression.kind === 'inline' || options.revealBoundaryExpressions)) {
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
	ranges: Range<Decoration>[]
) => {
	let position = expression.from;

	while (position <= expression.to) {
		const line = state.doc.lineAt(position);
		ranges.push(Decoration.line({ class: 'joplin-live-math-source-line' }).range(line.from));

		if (line.to >= expression.to || line.to === state.doc.length) {
			break;
		}

		position = line.to + 1;
	}
};

const buildDecorations = (
	state: EditorState,
	expressions: MathExpression[],
	options = defaultBuildDecorationOptions
): DecorationSet => {
	if (!state.facet(liveMathEnabledFacet)) {
		return Decoration.none;
	}

	const ranges: Range<Decoration>[] = [];

	for (const expression of expressions) {
		// Structural requirement (see `spansMultipleLines` above) -- distinct
		// from `expression.block`/`expression.displayMode`, which only capture
		// styling intent.
		const mustRenderAsBlock = expression.block || spansMultipleLines(state, expression);

		if (selectionTouchesExpression(state, expression, options)) {
			if (mustRenderAsBlock) {
				addDisplaySourceLineDecorations(state, expression, ranges);
			} else {
				ranges.push(Decoration.mark({ class: 'joplin-live-math-source-inline' }).range(expression.from, expression.to));
			}

			continue;
		}

		ranges.push(
			Decoration.replace({
				widget: new MathWidget(
					expression.source,
					expression.displayMode,
					mustRenderAsBlock,
					expression.from,
					expression.to,
					expression.contentFrom,
					expression.contentTo,
					blockIndentColumns(state, expression, mustRenderAsBlock),
					mustRenderAsBlock && /^[ \t]*>/.test(
						state.sliceDoc(state.doc.lineAt(expression.from).from, expression.from)
					)
				),
				block: mustRenderAsBlock,
			}).range(expression.from, expression.to)
		);
	}

	// A revealed block's line marker may precede an inline widget on the same line.
	return Decoration.set(ranges, true);
};

const parseExpressions = (state: EditorState): MathExpression[] =>
	findMathExpressions(state.doc.toString());

const recompute = (state: EditorState): MathDecorationState => {
	if (!state.facet(liveMathEnabledFacet)) {
		return { expressions: [], decorations: Decoration.none, pointerSelecting: false };
	}

	const expressions = parseExpressions(state);
	return { expressions, decorations: buildDecorations(state, expressions), pointerSelecting: false };
};

export const mathDecorationsField = StateField.define<MathDecorationState>({
	create: recompute,
	update: (value, transaction) => {
		if (transaction.docChanged ||
			transaction.state.facet(liveMathEnabledFacet) !== transaction.startState.facet(liveMathEnabledFacet)) {
			return recompute(transaction.state);
		}

		let pointerSelecting = value.pointerSelecting;
		for (const effect of transaction.effects) {
			if (effect.is(setMathPointerSelecting)) pointerSelecting = effect.value;
		}

		// Keep both rendered widgets and already-open source fixed throughout a drag.
		if (pointerSelecting) return { ...value, pointerSelecting };

		if (transaction.selection || transaction.reconfigured || pointerSelecting !== value.pointerSelecting) {
			// The document is unchanged, so the parsed expressions (and their
			// absolute positions) are still valid. Only the selection-sensitive
			// source-vs-widget decision needs recomputing, so skip re-parsing.
			return {
				expressions: value.expressions,
				pointerSelecting,
				decorations: buildDecorations(transaction.state, value.expressions, {
					revealBoundaryExpressions: value.pointerSelecting || transaction.isUserEvent('select.pointer'),
				}),
			};
		}

		return value;
	},
	provide: field => EditorView.decorations.from(field, value => value.decorations),
});
