import { WidgetType } from '@codemirror/view';
import katex from 'katex';

export class MathWidget extends WidgetType {
	public constructor(
		private readonly source: string,
		private readonly katexDisplayMode: boolean,
		private readonly blockLayout: boolean,
		private readonly from: number,
		private readonly to: number,
		private readonly contentFrom: number,
		private readonly contentTo: number,
		private readonly indentColumns = 0
	) {
		super();
	}

	public eq(other: MathWidget): boolean {
		return (
			other.source === this.source &&
			other.katexDisplayMode === this.katexDisplayMode &&
			other.blockLayout === this.blockLayout &&
			other.from === this.from &&
			other.to === this.to &&
			other.contentFrom === this.contentFrom &&
			other.contentTo === this.contentTo &&
			other.indentColumns === this.indentColumns
		);
	}

	public toDOM(): HTMLElement {
		const container = document.createElement(this.blockLayout ? 'div' : 'span');
		container.className = this.blockLayout ? 'joplin-live-math-display' : 'joplin-live-math-inline';
		container.setAttribute('aria-label', this.source);
		container.setAttribute('data-joplin-live-math-widget', 'true');
		container.setAttribute('data-joplin-live-math-display-mode', String(this.katexDisplayMode));
		container.setAttribute('data-joplin-live-math-block-layout', String(this.blockLayout));
		container.setAttribute('data-joplin-live-math-from', String(this.from));
		container.setAttribute('data-joplin-live-math-to', String(this.to));
		container.setAttribute('data-joplin-live-math-content-from', String(this.contentFrom));
		container.setAttribute('data-joplin-live-math-content-to', String(this.contentTo));
		container.setAttribute('data-joplin-live-math-indent-columns', String(this.indentColumns));
		container.style.setProperty('--joplin-live-math-indent-width', `${this.indentColumns}ch`);

		try {
			katex.render(this.source, container, {
				displayMode: this.katexDisplayMode,
				throwOnError: false,
				strict: 'ignore',
				trust: false,
			});
		} catch (error) {
			container.classList.add('joplin-live-math-error');
			container.textContent = this.katexDisplayMode ? `$$ ${this.source} $$` : `$${this.source}$`;
			container.title = error instanceof Error ? error.message : 'KaTeX could not render this expression';
		}

		return container;
	}

	public ignoreEvent(): boolean {
		return false;
	}
}
