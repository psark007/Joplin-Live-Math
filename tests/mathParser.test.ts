import { describe, expect, it } from 'vitest';
import katex from 'katex';
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

	it('finds inline equality expressions', () => {
		expect(findMathExpressions('$x=y$')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: 'x=y',
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

	it('renders math that begins with a digit', () => {
		expect(findMathExpressions('$2x + 1$')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: '2x + 1',
			}),
		]);
	});

	it('does not treat spaced currency as math', () => {
		expect(findMathExpressions('It costs $ 5 to $ 10')).toEqual([]);
	});

	it('does not treat a spaced currency amount as a closing delimiter', () => {
		expect(findMathExpressions('$x$ and $ 5')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: 'x',
			}),
		]);
	});

	it('ignores escaped dollars', () => {
		expect(findMathExpressions('Escaped: \\$20 and \\$x\\$')).toEqual([]);
	});

	it('renders inline code spans that contain only math', () => {
		expect(findMathExpressions('Code: `$x=y$`')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: 'x=y',
			}),
		]);
	});

	it('renders spaced inline code spans that contain only math', () => {
		expect(findMathExpressions('Code: ` $x=y$ `')).toEqual([
			expect.objectContaining({
				kind: 'inline',
				source: 'x=y',
			}),
		]);
	});

	it('ignores mixed inline code spans', () => {
		expect(findMathExpressions('Code: `const formula = "$x^2$"`')).toEqual([]);
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

	it('preserves a greater-than comparison line in top-level display math', () => {
		const doc = [
			'$$',
			'a',
			'>',
			'b',
			'$$',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'a\n>\nb',
				block: true,
				displayMode: true,
			}),
		]);
	});

	it('treats a standalone escaped greater-than line as a display math operator', () => {
		const doc = [
			'$$',
			String.raw`d\big(U(a^{(2)}),U(b^{(2)})\big)`,
			String.raw`\>`,
			String.raw`d\big(U(a^{(3)}),U(b^{(3)})\big)`,
			'$$',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: [
					String.raw`d\big(U(a^{(2)}),U(b^{(2)})\big)`,
					'>',
					String.raw`d\big(U(a^{(3)}),U(b^{(3)})\big)`,
				].join('\n'),
				block: true,
				displayMode: true,
			}),
		]);
	});

	it('finds multiline display math with content beside delimiters', () => {
		const doc = String.raw`$$L = \begin{pmatrix}
\ell_{11} & 0 & 0 & \cdots & 0 \\
\ell_{21} & \ell_{22} & 0 & \cdots & 0 \\
\ell_{31} & \ell_{32} & \ell_{33} & \cdots & 0 \\
\vdots & \vdots & \vdots & \ddots & \vdots \\
\ell_{n1} & \ell_{n2} & \ell_{n3} & \cdots & \ell_{nn}
\end{pmatrix}$$`;

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: expect.stringContaining(String.raw`L = \begin{pmatrix}`),
				block: true,
				displayMode: true,
			}),
		]);
	});

	it('parses tagged pmatrix display math as KaTeX display-mode source', () => {
		const doc = [
			'$$',
			String.raw`x_\varepsilon(t)=`,
			String.raw`\begin{pmatrix}`,
			String.raw`tI_3+i\varepsilon h(t)D`,
			'&',
			String.raw`i\left(I_3+\varepsilon h(t)(X+2I_3)\right)`,
			String.raw`\\[2mm]`,
			String.raw`i\left(I_3+\varepsilon h(t)(X+2I_3)\right)`,
			'&',
			String.raw`2I_3`,
			String.raw`\end{pmatrix}.`,
			String.raw`\tag{1}`,
			'$$',
		].join('\n');
		const [expression] = findMathExpressions(doc);

		expect(expression).toEqual(expect.objectContaining({
			kind: 'display',
			source: expect.stringContaining(String.raw`\tag{1}`),
			block: true,
			displayMode: true,
		}));

		const html = katex.renderToString(expression.source, {
			displayMode: expression.displayMode,
			throwOnError: false,
			strict: 'ignore',
			trust: false,
		});

		expect(html).toContain('katex-display');
		expect(html).not.toContain('katex-error');
	});

	it('finds same-line double-dollar math as inline-layout math', () => {
		expect(findMathExpressions('> An equation $$ x + y $$ here')).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'x + y',
				block: false,
				displayMode: true,
			}),
		]);
	});

	it('finds multiline display math with content beside delimiters inside blockquotes', () => {
		const doc = [
			String.raw`> $$L = \begin{pmatrix}`,
			'> x & y',
			String.raw`> \end{pmatrix}$$`,
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: String.raw`L = \begin{pmatrix}
x & y
\end{pmatrix}`,
				block: false,
				displayMode: true,
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
				displayMode: true,
			}),
		]);
	});

	it('treats a standalone escaped greater-than line as an operator inside blockquoted display math', () => {
		const doc = [
			'> $$',
			'> a',
			String.raw`> \>`,
			'> b',
			'> $$',
		].join('\n');

		expect(findMathExpressions(doc)).toEqual([
			expect.objectContaining({
				kind: 'display',
				source: 'a\n>\nb',
				block: false,
				displayMode: true,
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
				displayMode: true,
			}),
		]);
	});

	it('leaves incomplete math untouched', () => {
		expect(findMathExpressions('Broken math: $\\frac{')).toEqual([]);
	});
});
