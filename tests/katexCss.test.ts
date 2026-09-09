import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { describe, expect, it } from 'vitest';

const { embedKatexFonts } = require('../scripts/katexCss');
const katexDistDir = dirname(require.resolve('katex'));

describe('bundled KaTeX fonts', () => {
	it('embeds every font face using the matching WOFF2 bytes', () => {
		const original = postcss.parse(readFileSync(join(katexDistDir, 'katex.min.css'), 'utf8'));
		const bundled = postcss.parse(embedKatexFonts(original.toString()));
		const expectedFonts: Buffer[] = [];
		original.walkAtRules('font-face', rule => {
			rule.walkDecls('src', declaration => {
				valueParser(declaration.value).walk(node => {
					if (node.type === 'function' && node.value === 'url' &&
						node.nodes.length === 1 && node.nodes[0].value.endsWith('.woff2')) {
						expectedFonts.push(readFileSync(join(katexDistDir, node.nodes[0].value)));
					}
				});
			});
		});

		const embeddedFonts: Buffer[] = [];
		bundled.walkAtRules('font-face', rule => {
			rule.walkDecls('src', declaration => {
				const nodes = valueParser(declaration.value).nodes;
				const url = nodes[0];
				expect(url.type).toBe('function');
				if (url.type !== 'function') throw new Error('Expected a font URL');
				const source = url.nodes[0].value;
				const prefix = 'data:font/woff2;base64,';
				expect(source.startsWith(prefix)).toBe(true);
				embeddedFonts.push(Buffer.from(source.slice(prefix.length), 'base64'));
			});
		});
		expect(expectedFonts.length).toBeGreaterThan(0);
		expect(embeddedFonts).toEqual(expectedFonts);
		expect(bundled.toString()).not.toContain('url(fonts/');
	});

	it('fails the build instead of silently leaving an external font source', () => {
		expect(() => embedKatexFonts('@font-face{src:url(fonts/missing.ttf)}')).toThrow('WOFF2');
	});
});
