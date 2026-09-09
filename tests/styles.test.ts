import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');

const ruleBody = (selector: string): string => {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles);
	return match?.[1] ?? '';
};

describe('math widget styles', () => {
	it('resets inherited Rich Markdown text indentation on inline widgets', () => {
		expect(ruleBody('.joplin-live-math-inline')).toMatch(/text-indent:\s*0;/);
	});

	it('resets inherited Rich Markdown text indentation on display widgets', () => {
		expect(ruleBody('.joplin-live-math-display')).toMatch(/text-indent:\s*0;/);
	});

	it('keeps display-style KaTeX inline when rendered by an inline widget', () => {
		expect(ruleBody('.joplin-live-math-inline > .katex-display')).toMatch(/display:\s*inline-block;/);
		expect(ruleBody('.joplin-live-math-inline > .katex-display')).toMatch(/margin:\s*0;/);
	});
});
