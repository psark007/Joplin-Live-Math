import { parser as markdownParser } from '@lezer/markdown';

export type MathExpressionKind = 'inline' | 'display';

export interface MathExpression {
	kind: MathExpressionKind;
	from: number;
	to: number;
	contentFrom: number;
	contentTo: number;
	source: string;
	block: boolean;
	displayMode: boolean;
}

interface TextLine {
	from: number;
	to: number;
	text: string;
}

interface Range {
	from: number;
	to: number;
}

interface InlineCodeSpan extends Range {
	contentFrom: number;
	contentTo: number;
	text: string;
}

interface DisplaySourceOptions {
	blockquoteDepth: number;
}

const lineIterator = (doc: string): TextLine[] => {
	const lines: TextLine[] = [];
	let lineStart = 0;

	while (lineStart <= doc.length) {
		const newlineIndex = doc.indexOf('\n', lineStart);
		const lineEnd = newlineIndex === -1 ? doc.length : newlineIndex;
		lines.push({
			from: lineStart,
			to: lineEnd,
			text: doc.slice(lineStart, lineEnd),
		});

		if (newlineIndex === -1) {
			break;
		}

		lineStart = newlineIndex + 1;
	}

	return lines;
};

const isEscaped = (doc: string, index: number): boolean => {
	let slashCount = 0;
	let position = index - 1;

	while (position >= 0 && doc[position] === '\\') {
		slashCount += 1;
		position -= 1;
	}

	return slashCount % 2 === 1;
};

const isPositionInRanges = (position: number, ranges: Range[]): boolean =>
	ranges.some(range => position >= range.from && position < range.to);

const intersects = (left: Range, right: Range): boolean => left.from < right.to && right.from < left.to;

const markdownContainerContentOffset = (lineText: string): { offset: number; hasMarkdownContainer: boolean; blockquoteDepth: number } => {
	let offset = 0;
	let hasMarkdownContainer = false;
	let blockquoteDepth = 0;

	const leadingWhitespace = /^[ \t]*/.exec(lineText.slice(offset))?.[0] ?? '';
	if (leadingWhitespace.length > 0) {
		hasMarkdownContainer = true;
		offset += leadingWhitespace.length;
	}

	while (lineText[offset] === '>') {
		hasMarkdownContainer = true;
		blockquoteDepth += 1;
		offset += 1;

		if (lineText[offset] === ' ' || lineText[offset] === '\t') {
			offset += 1;
		}

		const whitespace = /^[ \t]*/.exec(lineText.slice(offset))?.[0] ?? '';
		offset += whitespace.length;
	}

	const listMarker = /^(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(lineText.slice(offset));
	if (listMarker) {
		hasMarkdownContainer = true;
		offset += listMarker[0].length;
	}

	const trailingWhitespace = /^[ \t]*/.exec(lineText.slice(offset))?.[0] ?? '';
	offset += trailingWhitespace.length;

	return { offset, hasMarkdownContainer, blockquoteDepth };
};

const findFencedCodeRanges = (doc: string): Range[] => {
	const ranges: Range[] = [];
	markdownParser.parse(doc).iterate({
		enter: node => {
			if (node.name === 'FencedCode') {
				ranges.push({ from: node.from, to: node.to });
				return false;
			}
			return undefined;
		},
	});
	return ranges;
};

const findDisplayDelimiterLine = (
	line: TextLine,
	excludedRanges: Range[]
): { delimiterFrom: number; delimiterTo: number; block: boolean; blockquoteDepth: number } | null => {
	if (isPositionInRanges(line.from, excludedRanges)) {
		return null;
	}

	const { offset, hasMarkdownContainer, blockquoteDepth } = markdownContainerContentOffset(line.text);
	if (!line.text.slice(offset).match(/^\$\$\s*$/)) {
		return null;
	}

	const delimiterFrom = line.from + offset;

	return {
		delimiterFrom,
		delimiterTo: delimiterFrom + 2,
		block: !hasMarkdownContainer && offset === 0,
		blockquoteDepth,
	};
};

const stripBlockquotePrefix = (lineText: string, depth: number): string => {
	let text = lineText;

	for (let level = 0; level < depth; level += 1) {
		const match = /^[ \t]*>[ \t]?/.exec(text);
		if (!match) {
			return text;
		}

		text = text.slice(match[0].length);
	}
	return text;
};

const normalizeStandaloneEscapedGreaterThan = (lineText: string): string =>
	lineText.replace(/^([ \t]*)\\>([ \t]*)$/, '$1>$2');

const displaySourceFromText = (text: string, options: DisplaySourceOptions): string => {
	const normalizedLines = text.split('\n')
		.map(line => stripBlockquotePrefix(line, options.blockquoteDepth))
		.map(normalizeStandaloneEscapedGreaterThan);
	const contentLines = normalizedLines.filter(line => line.trim().length > 0);
	if (contentLines.length === 0) {
		return '';
	}

	const commonIndent = Math.min(
		...contentLines.map(line => (/^[ \t]*/.exec(line)?.[0].length ?? 0))
	);

	return normalizedLines
		.map(line => line.slice(Math.min(commonIndent, line.length)))
		.join('\n')
		.trim();
};

const displaySourceFromLines = (lines: TextLine[], options: DisplaySourceOptions): string =>
	displaySourceFromText(lines.map(line => line.text).join('\n'), options);

const findDisplayMath = (doc: string, lines: TextLine[], excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const opening = lines[index];
		const openingDelimiter = findDisplayDelimiterLine(opening, excludedRanges);
		if (!openingDelimiter) {
			continue;
		}

		for (let closeIndex = index + 1; closeIndex < lines.length; closeIndex += 1) {
			const closing = lines[closeIndex];
			if (excludedRanges.some(range => intersects({ from: opening.from, to: closing.to }, range))) {
				break;
			}
			const closingDelimiter = findDisplayDelimiterLine(closing, excludedRanges);
			if (!closingDelimiter) {
				continue;
			}

			const contentFrom = opening.to < doc.length ? opening.to + 1 : opening.to;
			const contentTo = closing.from;
			const block = openingDelimiter.block && closingDelimiter.block;
			const source = displaySourceFromLines(
				lines.slice(index + 1, closeIndex),
				{ blockquoteDepth: openingDelimiter.blockquoteDepth }
			);
			if (source.length > 0) {
				expressions.push({
					kind: 'display',
					from: block ? opening.from : openingDelimiter.delimiterFrom,
					to: block ? closing.to : closingDelimiter.delimiterTo,
					contentFrom,
					contentTo,
					source,
					block,
					displayMode: true,
				});
			}

			index = closeIndex;
			break;
		}
	}

	return expressions;
};

const findInlineCodeSpansInLine = (line: TextLine): InlineCodeSpan[] => {
	const spans: InlineCodeSpan[] = [];
	let index = 0;

	while (index < line.text.length) {
		if (line.text[index] !== '`') {
			index += 1;
			continue;
		}

		let tickCount = 1;
		while (line.text[index + tickCount] === '`') {
			tickCount += 1;
		}

		let closeIndex = index + tickCount;
		while (closeIndex < line.text.length) {
			if (line.text[closeIndex] !== '`') {
				closeIndex += 1;
				continue;
			}

			let closeTickCount = 1;
			while (line.text[closeIndex + closeTickCount] === '`') {
				closeTickCount += 1;
			}

			if (closeTickCount === tickCount) {
				spans.push({
					from: line.from + index,
					contentFrom: line.from + index + tickCount,
					contentTo: line.from + closeIndex,
					to: line.from + closeIndex + tickCount,
					text: line.text.slice(index + tickCount, closeIndex),
				});
				index = closeIndex + tickCount;
				break;
			}

			closeIndex += closeTickCount;
		}

		if (closeIndex >= line.text.length) {
			break;
		}
	}

	return spans;
};

const nextNonExcludedPosition = (position: number, ranges: Range[]): number => {
	const containingRange = ranges.find(range => position >= range.from && position < range.to);
	return containingRange ? containingRange.to : position;
};

const isDoubleDollarDelimiter = (doc: string, index: number): boolean =>
	doc[index] === '$' && doc[index + 1] === '$' && !isEscaped(doc, index);

const findDoubleDollarInLine = (
	doc: string,
	line: TextLine,
	from: number,
	excludedRanges: Range[]
): number | null => {
	let position = Math.max(from, line.from);

	while (position < line.to - 1) {
		const nextPosition = nextNonExcludedPosition(position, excludedRanges);
		if (nextPosition !== position) {
			position = nextPosition;
			continue;
		}

		if (isDoubleDollarDelimiter(doc, position)) {
			return position;
		}

		position += 1;
	}

	return null;
};

const isTopLevelMultilineDisplayBlock = (
	opening: TextLine,
	openingDelimiterFrom: number,
	closing: TextLine,
	closingDelimiterFrom: number
): boolean => {
	const openingOffset = openingDelimiterFrom - opening.from;
	const openingContainer = markdownContainerContentOffset(opening.text);

	if (openingContainer.hasMarkdownContainer || openingOffset !== 0) {
		return false;
	}

	const closingOffset = closingDelimiterFrom - closing.from;
	return closing.text.slice(closingOffset + 2).trim().length === 0;
};

const findMultilineDisplayMath = (doc: string, lines: TextLine[], excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const opening = lines[index];
		let searchFrom = opening.from;

		while (searchFrom < opening.to - 1) {
			const openingDelimiterFrom = findDoubleDollarInLine(doc, opening, searchFrom, excludedRanges);
			if (openingDelimiterFrom === null) {
				break;
			}

			const sameLineClosingDelimiter = findDoubleDollarInLine(
				doc,
				opening,
				openingDelimiterFrom + 2,
				excludedRanges
			);
			if (sameLineClosingDelimiter !== null) {
				searchFrom = sameLineClosingDelimiter + 2;
				continue;
			}

			for (let closeIndex = index + 1; closeIndex < lines.length; closeIndex += 1) {
				const closing = lines[closeIndex];
				const closingDelimiterFrom = findDoubleDollarInLine(doc, closing, closing.from, excludedRanges);
				if (excludedRanges.some(range => intersects({
					from: openingDelimiterFrom,
					to: closingDelimiterFrom === null ? closing.to : closingDelimiterFrom + 2,
				}, range))) {
					break;
				}
				if (closingDelimiterFrom === null) {
					continue;
				}

				const contentFrom = openingDelimiterFrom + 2;
				const contentTo = closingDelimiterFrom;
				const block = isTopLevelMultilineDisplayBlock(
					opening,
					openingDelimiterFrom,
					closing,
					closingDelimiterFrom
				);
				const source = displaySourceFromText(
					doc.slice(contentFrom, contentTo),
					{ blockquoteDepth: markdownContainerContentOffset(opening.text).blockquoteDepth }
				);
				if (source.length > 0) {
					expressions.push({
						kind: 'display',
						from: block ? opening.from : openingDelimiterFrom,
						to: block ? closing.to : closingDelimiterFrom + 2,
						contentFrom,
						contentTo,
						source,
						block,
						displayMode: true,
					});
				}

				index = closeIndex;
				searchFrom = opening.to;
				break;
			}

			if (searchFrom < opening.to) {
				searchFrom = openingDelimiterFrom + 2;
			}
		}
	}

	return expressions;
};

const expressionFromInlineCodeSpan = (span: InlineCodeSpan): MathExpression | null => {
	const leadingWhitespace = /^[ \t]*/.exec(span.text)?.[0].length ?? 0;
	const trailingWhitespace = /[ \t]*$/.exec(span.text)?.[0].length ?? 0;
	const trimmedFrom = span.contentFrom + leadingWhitespace;
	const trimmedTo = span.contentTo - trailingWhitespace;
	const text = span.text.slice(leadingWhitespace, span.text.length - trailingWhitespace);
	const delimiterWidth = text.startsWith('$$') ? 2 : 1;
	for (let index = delimiterWidth; index < text.length - delimiterWidth; index += 1) {
		if (text[index] === '$' && !isEscaped(text, index)) {
			return null;
		}
	}

	if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) {
		const source = text.slice(2, -2).trim();
		if (source.length === 0) {
			return null;
		}

		return {
			kind: 'display',
			from: span.from,
			to: span.to,
			contentFrom: trimmedFrom + 2,
			contentTo: trimmedTo - 2,
			source,
			block: false,
			displayMode: true,
		};
	}

	if (text.startsWith('$') && text.endsWith('$') && !text.startsWith('$$') && text.length > 2) {
		const source = text.slice(1, -1).trim();
		if (source.length === 0) {
			return null;
		}

		return {
			kind: 'inline',
			from: span.from,
			to: span.to,
			contentFrom: trimmedFrom + 1,
			contentTo: trimmedTo - 1,
			source,
			block: false,
			displayMode: false,
		};
	}

	return null;
};

const findInlineCodeMath = (spans: InlineCodeSpan[], excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];

	for (const span of spans) {
		if (excludedRanges.some(range => intersects(span, range))) {
			continue;
		}

		const expression = expressionFromInlineCodeSpan(span);
		if (expression) {
			expressions.push(expression);
		}
	}

	return expressions;
};

const findInlineDisplayMathInLine = (doc: string, line: TextLine, excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];
	let index = line.from;

	while (index < line.to - 1) {
		const nextPosition = nextNonExcludedPosition(index, excludedRanges);
		if (nextPosition !== index) {
			index = nextPosition;
			continue;
		}

		if (!isDoubleDollarDelimiter(doc, index)) {
			index += 1;
			continue;
		}

		let closeIndex = index + 2;
		while (closeIndex < line.to - 1) {
			const nextClosePosition = nextNonExcludedPosition(closeIndex, excludedRanges);
			if (nextClosePosition !== closeIndex) {
				closeIndex = nextClosePosition;
				continue;
			}

			if (isDoubleDollarDelimiter(doc, closeIndex)) {
				const source = doc.slice(index + 2, closeIndex).trim();
				if (source.length > 0) {
					expressions.push({
						kind: 'display',
						from: index,
						to: closeIndex + 2,
						contentFrom: index + 2,
						contentTo: closeIndex,
						source,
						block: false,
						displayMode: true,
					});
				}

				index = closeIndex + 2;
				break;
			}

			closeIndex += 1;
		}

		if (closeIndex >= line.to - 1) {
			index += 2;
		}
	}

	return expressions;
};

const isFollowedByWhitespaceThenDigit = (doc: string, index: number): boolean => {
	const next = doc[index + 1];
	if (next !== ' ' && next !== '\t') {
		return false;
	}

	let position = index + 1;
	while (position < doc.length && (doc[position] === ' ' || doc[position] === '\t')) {
		position += 1;
	}

	const char = doc[position];
	return char !== undefined && char >= '0' && char <= '9';
};

const isInlineOpeningDollar = (doc: string, index: number): boolean => {
	const next = doc[index + 1];
	if (doc[index] !== '$' || next === undefined || next === '$' || isEscaped(doc, index)) {
		return false;
	}

	// A "$" directly followed by whitespace and then a digit is almost always a
	// currency amount (e.g. "$ 5"), not the start of an inline expression.
	if (isFollowedByWhitespaceThenDigit(doc, index)) {
		return false;
	}

	return doc[index - 1] !== '$';
};

const isInlineClosingDollar = (doc: string, index: number): boolean => {
	const previous = doc[index - 1];
	const next = doc[index + 1];

	if (doc[index] !== '$' || previous === undefined || previous === '$' || isEscaped(doc, index)) {
		return false;
	}

	// Similarly, a "$" followed by whitespace then a digit closes a currency
	// amount (e.g. "and $ 5") rather than an inline expression.
	if (isFollowedByWhitespaceThenDigit(doc, index)) {
		return false;
	}

	return !next || !/[A-Za-z0-9$]/.test(next);
};

const findInlineMathInLine = (doc: string, line: TextLine, excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];
	let index = line.from;

	while (index < line.to) {
		const nextPosition = nextNonExcludedPosition(index, excludedRanges);
		if (nextPosition !== index) {
			index = nextPosition;
			continue;
		}

		if (!isInlineOpeningDollar(doc, index)) {
			index += 1;
			continue;
		}

		let closeIndex = index + 1;
		while (closeIndex < line.to) {
			const nextClosePosition = nextNonExcludedPosition(closeIndex, excludedRanges);
			if (nextClosePosition !== closeIndex) {
				closeIndex = nextClosePosition;
				continue;
			}

			if (isInlineClosingDollar(doc, closeIndex)) {
				const source = doc.slice(index + 1, closeIndex).trim();
				if (source.length > 0) {
					expressions.push({
						kind: 'inline',
						from: index,
						to: closeIndex + 1,
						contentFrom: index + 1,
						contentTo: closeIndex,
						source,
						block: false,
						displayMode: false,
					});
				}

				index = closeIndex + 1;
				break;
			}

			closeIndex += 1;
		}

		if (closeIndex >= line.to) {
			index += 1;
		}
	}

	return expressions;
};

export const findMathExpressions = (doc: string): MathExpression[] => {
	const lines = lineIterator(doc);
	const fencedCodeRanges = findFencedCodeRanges(doc);
	const displayExpressions = findDisplayMath(doc, lines, fencedCodeRanges);
	const displayRanges = displayExpressions.map(({ from, to }) => ({ from, to }));
	const inlineCodeSpans = lines.flatMap(findInlineCodeSpansInLine);
	const inlineCodeRanges = inlineCodeSpans.map(({ from, to }) => ({ from, to }));
	const multilineDisplayExpressions = findMultilineDisplayMath(doc, lines, [
		...fencedCodeRanges,
		...displayRanges,
		...inlineCodeRanges,
	]);
	const multilineDisplayRanges = multilineDisplayExpressions.map(({ from, to }) => ({ from, to }));
	const inlineCodeExpressions = findInlineCodeMath(inlineCodeSpans, [
		...fencedCodeRanges,
		...displayRanges,
		...multilineDisplayRanges,
	]);
	const inlineDisplayExpressions: MathExpression[] = [];

	for (const line of lines) {
		inlineDisplayExpressions.push(
			...findInlineDisplayMathInLine(doc, line, [
				...fencedCodeRanges,
				...displayRanges,
				...multilineDisplayRanges,
				...inlineCodeRanges,
			])
		);
	}

	const inlineDisplayRanges = inlineDisplayExpressions.map(({ from, to }) => ({ from, to }));
	const inlineExcludedRanges = [
		...fencedCodeRanges,
		...displayRanges,
		...multilineDisplayRanges,
		...inlineDisplayRanges,
		...inlineCodeRanges,
	];
	const inlineExpressions: MathExpression[] = [];

	for (const line of lines) {
		inlineExpressions.push(
			...findInlineMathInLine(doc, line, [
				...inlineExcludedRanges,
			])
		);
	}

	return [
		...displayExpressions,
		...multilineDisplayExpressions,
		...inlineCodeExpressions,
		...inlineDisplayExpressions,
		...inlineExpressions,
	]
		.sort((a, b) => a.from - b.from);
};
