import { parser, Table, Strikethrough, type InlineContext } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';
import katex from 'katex';
import { findMathExpressions, type MathExpression } from './mathParser';

const tableParser = parser.configure(Table);

// Lezer omits empty TableCell nodes. Its delimiter nodes still identify every column.
export const tableCellSources = (source: string): string[][] | null => {
	source = source.split('\n').map(line => line.trim()).join('\n');
	const table = tableParser.parse(source).topNode.firstChild;
	if (table?.name !== 'Table' || source.slice(table.to).trim()) return null;
	const rows: string[][] = [];
	for (let row = table.firstChild; row; row = row.nextSibling) {
		if (row.name !== 'TableHeader' && row.name !== 'TableRow') continue;
		const cells: string[] = [];
		let from = row.from;
		const delimiters = row.getChildren('TableDelimiter');
		for (const delimiter of delimiters) {
			if (delimiter !== delimiters[0] || source.slice(from, delimiter.from).trim()) {
				cells.push(source.slice(from, delimiter.from).trim().replace(/\\\|/g, '|'));
			}
			from = delimiter.to;
		}
		if (source.slice(from, row.to).trim() || cells.length === 0) {
			cells.push(source.slice(from, row.to).trim().replace(/\\\|/g, '|'));
		}
		rows.push(cells);
	}
	if (!rows.length) return null;
	return rows.map(row => Array.from({ length: rows[0].length }, (_, column) => row[column] ?? ''));
};

const inlineMathCache = new WeakMap<InlineContext, Map<number, MathExpression>>();
const cellParser = parser.configure([
	Strikethrough,
	{
		// Cells are inline Markdown, even when they begin with a heading or HTML tag.
		remove: ['ATXHeading', 'SetextHeading', 'HTMLBlock', 'FencedCode', 'IndentedCode',
			'BulletList', 'OrderedList', 'Blockquote', 'HorizontalRule', 'LinkReference'],
		defineNodes: ['LiveMath'],
		parseInline: [{
			name: 'LiveMath',
			before: 'Escape',
			parse: (context, next, position) => {
				if (next !== 36 && next !== 96) return -1;
				let expressions = inlineMathCache.get(context);
				if (!expressions) {
					expressions = new Map(findMathExpressions(context.text).map(expression => [expression.from, expression]));
					inlineMathCache.set(context, expressions);
				}
				const expression = expressions.get(position - context.offset);
				return expression ? context.addElement(context.elt('LiveMath', position, context.offset + expression.to)) : -1;
			},
		}],
	},
]);

const safeLink = (url: string): boolean => {
	try {
		return ['https:', 'http:', 'mailto:', 'tel:', 'joplin:'].includes(new URL(url, 'https://joplin.invalid/').protocol);
	} catch {
		return false;
	}
};

// Build a separate preview, never insert KaTeX into Joplin's editable text div.
export const renderTableMath = (source: string, document: Document): HTMLElement | null => {
	if (!findMathExpressions(source).length) return null;
	const preview = document.createElement('div');
	preview.className = 'joplin-live-math-table-preview';
	preview.contentEditable = 'false';
	const text = (parent: Node, value: string) => parent.appendChild(document.createTextNode(value));

	const appendChildren = (parent: Node, node: SyntaxNode, from = node.from, to = node.to) => {
		let position = from;
		for (let child = node.firstChild; child; child = child.nextSibling) {
			if (child.from < from || child.to > to) continue;
			text(parent, source.slice(position, child.from));
			appendNode(parent, child);
			position = child.to;
		}
		text(parent, source.slice(position, to));
	};

	const appendNode = (parent: Node, node: SyntaxNode): void => {
		const value = source.slice(node.from, node.to);
		if (['EmphasisMark', 'StrikethroughMark', 'CodeMark'].includes(node.name)) return;
		if (node.name === 'LiveMath') {
			const expression = findMathExpressions(value)[0];
			const math = document.createElement('span');
			math.className = 'joplin-live-math-table-equation';
			math.setAttribute('aria-label', value);
			try {
				katex.render(expression.source, math, {
					displayMode: expression.displayMode, throwOnError: false, strict: 'ignore', trust: false,
				});
			} catch (error) {
				math.classList.add('joplin-live-math-error');
				math.textContent = value;
				math.title = error instanceof Error ? error.message : 'KaTeX could not render this expression';
			}
			parent.appendChild(math);
		} else if (node.name === 'InlineCode') {
			const code = document.createElement('code');
			code.textContent = source.slice(node.firstChild!.to, node.lastChild!.from);
			parent.appendChild(code);
		} else if (['Emphasis', 'StrongEmphasis', 'Strikethrough'].includes(node.name)) {
			const element = document.createElement(node.name === 'Emphasis' ? 'em' : node.name === 'StrongEmphasis' ? 'strong' : 'del');
			appendChildren(element, node);
			parent.appendChild(element);
		} else if (node.name === 'Link') {
			const marks = node.getChildren('LinkMark');
			const url = node.getChild('URL');
			if (marks.length < 2 || !url) { text(parent, value); return; }
			const href = source.slice(url.from, url.to);
			const link = document.createElement(safeLink(href) ? 'a' : 'span');
			if (link.tagName === 'A') link.setAttribute('href', href);
			appendChildren(link, node, marks[0].to, marks[1].from);
			parent.appendChild(link);
		} else if (node.name === 'HTMLTag' && /^<br\s*\/?>$/i.test(value)) {
			parent.appendChild(document.createElement('br'));
		} else if (node.name === 'Escape') {
			text(parent, value.slice(1));
		} else if (node.name === 'Entity') {
			const decoder = document.createElement('textarea');
			decoder.innerHTML = value;
			text(parent, decoder.value);
		} else if (node.name === 'Document' || node.name === 'Paragraph') {
			appendChildren(parent, node);
		} else {
			text(parent, value);
		}
	};
	appendNode(preview, cellParser.parse(source).topNode);
	return preview;
};
