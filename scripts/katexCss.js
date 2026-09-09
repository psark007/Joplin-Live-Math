const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');

const katexDistDir = path.dirname(require.resolve('katex'));

const embedKatexFonts = content => {
	const stylesheet = postcss.parse(content.toString());
	stylesheet.walkAtRules('font-face', rule => {
		rule.walkDecls('src', declaration => {
			const source = valueParser(declaration.value).nodes.find(node =>
				node.type === 'function' && node.value === 'url' &&
				node.nodes.length === 1 && node.nodes[0].value.endsWith('.woff2')
			);
			if (!source) {
				throw new Error('Expected a WOFF2 source for each KaTeX font');
			}

			// CM6 loads CSS as text, so relative font URLs would resolve against Joplin.
			const font = fs.readFileSync(path.join(katexDistDir, source.nodes[0].value));
			declaration.value = `url("data:font/woff2;base64,${font.toString('base64')}") format("woff2")`;
		});
	});
	return stylesheet.toString();
};

module.exports = { embedKatexFonts };
