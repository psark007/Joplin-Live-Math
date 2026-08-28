import { describe, expect, it } from 'vitest';
import { findMathExpressions } from '../src/mathParser';

describe('findMathExpressions', () => {
	it('finds one inline expression', () => {
		expect(findMathExpressions('Inline: $x^2 + 1$ test.')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: 'x^2 + 1',
			}),
		]);
	});

	it('finds multiple inline expressions', () => {
		const expressions = findMathExpressions('Two: $x$ and $y$.');
		expect(expressions.map(expression => expression.source)).toEqual(['x', 'y']);
	});

	it('finds inline expressions with interior delimiter whitespace', () => {
		const expressions = findMathExpressions('Two: $ x $ and $ y $.');
		expect(expressions.map(expression => expression.source)).toEqual(['x', 'y']);
	});

	it('does not swallow text between spaced inline expressions', () => {
		const expressions = findMathExpressions('$ x $ middle $ y $');
		expect(expressions.map(expression => expression.source)).toEqual(['x', 'y']);
	});

	it('does not treat common currency as math', () => {
		expect(findMathExpressions('Price: $20')).toEqual([]);
	});

	it('ignores escaped dollars', () => {
		expect(findMathExpressions('Escaped: \\$20 and \\$x\\$')).toEqual([]);
	});

	it('ignores inline code spans', () => {
		expect(findMathExpressions('Code: `$x^2$`')).toEqual([]);
	});

	it('ignores fenced code blocks', () => {
		const doc = [
			'```python',
			'price = "$20"',
			'formula = "$x^2$"',
			'```',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([]);
	});

	it('finds display math using delimiter lines', () => {
		const doc = [
			'Before',
			'$$',
			'\\frac{1}{n}\\sum_{i=1}^{n}X_i',
			'$$',
			'After',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: '\\frac{1}{n}\\sum_{i=1}^{n}X_i',
				block: true,
				displayMode: true,
			}),
		]);
	});

	it('finds same-line double-dollar math as inline-layout math', () => {
		expect(findMathExpressions('> An equation $$ x + y $$ here')).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'x + y',
				block: false,
				displayMode: false,
			}),
		]);
	});

	it('finds display math inside blockquotes', () => {
		const doc = [
			'> $$',
			'> x + y',
			'> $$',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'x + y',
				block: false,
				displayMode: false,
			}),
		]);
	});

	it('finds display math inside list items', () => {
		const doc = [
			'- $$',
			'  x + y',
			'  $$',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'x + y',
				block: false,
				displayMode: false,
			}),
		]);
	});

	it('leaves incomplete math untouched', () => {
		expect(findMathExpressions('Broken math: $\\frac{')).toEqual([]);
	});
});
