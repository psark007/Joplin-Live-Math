import { WidgetType } from '@codemirror/view';
import katex from 'katex';

export class MathWidget extends WidgetType {
	public constructor(
		private readonly source: string,
		private readonly displayMode: boolean,
		private readonly contentFrom: number,
		private readonly contentTo: number
	) {
		super();
	}

	public eq(other: MathWidget): boolean {
		return (
			other.source === this.source &&
			other.displayMode === this.displayMode &&
			other.contentFrom === this.contentFrom &&
			other.contentTo === this.contentTo
		);
	}

	public toDOM(): HTMLElement {
		const container = document.createElement(this.displayMode ? 'div' : 'span');
		container.className = this.displayMode ? 'joplin-live-math-display' : 'joplin-live-math-inline';
		container.setAttribute('aria-label', this.source);
		container.setAttribute('data-joplin-live-math-widget', 'true');
		container.setAttribute('data-joplin-live-math-content-from', String(this.contentFrom));
		container.setAttribute('data-joplin-live-math-content-to', String(this.contentTo));

		try {
			katex.render(this.source, container, {
				displayMode: this.displayMode,
				throwOnError: false,
				strict: 'ignore',
				trust: false,
			});
		} catch (error) {
			container.classList.add('joplin-live-math-error');
			container.textContent = this.displayMode ? `$$ ${this.source} $$` : `$${this.source}$`;
			container.title = error instanceof Error ? error.message : 'KaTeX could not render this expression';
		}

		return container;
	}

	public ignoreEvent(): boolean {
		return false;
	}
}
