import { WidgetType } from '@codemirror/view';
import katex from 'katex';

export class MathWidget extends WidgetType {
	public constructor(
		private readonly source: string,
		private readonly displayMode: boolean
	) {
		super();
	}

	public eq(other: MathWidget): boolean {
		return other.source === this.source && other.displayMode === this.displayMode;
	}

	public toDOM(): HTMLElement {
		const container = document.createElement(this.displayMode ? 'div' : 'span');
		container.className = this.displayMode ? 'joplin-live-math-display' : 'joplin-live-math-inline';
		container.setAttribute('aria-label', this.source);

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
