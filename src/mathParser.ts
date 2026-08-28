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

const intersects = (from: number, to: number, range: Range): boolean => from < range.to && range.from < to;

const isPositionInRanges = (position: number, ranges: Range[]): boolean =>
	ranges.some(range => position >= range.from && position < range.to);

const markdownContainerContentOffset = (lineText: string): { offset: number; hasMarkdownContainer: boolean } => {
	let offset = 0;
	let hasMarkdownContainer = false;

	const leadingWhitespace = /^[ \t]*/.exec(lineText.slice(offset))?.[0] ?? '';
	if (leadingWhitespace.length > 0) {
		hasMarkdownContainer = true;
		offset += leadingWhitespace.length;
	}

	while (lineText[offset] === '>') {
		hasMarkdownContainer = true;
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

	return { offset, hasMarkdownContainer };
};

const lineStartsFence = (lineText: string) => {
	const match = /^( {0,3})(`{3,}|~{3,})/.exec(lineText);
	if (!match) {
		return null;
	}

	return {
		character: match[2][0],
		length: match[2].length,
	};
};

const lineClosesFence = (lineText: string, fence: { character: string; length: number }): boolean => {
	const match = /^( {0,3})(`+|~+)\s*$/.exec(lineText);
	return !!match && match[2][0] === fence.character && match[2].length >= fence.length;
};

const findFencedCodeRanges = (doc: string, lines: TextLine[]): Range[] => {
	const ranges: Range[] = [];
	let openFence: { character: string; length: number; from: number } | null = null;

	for (const line of lines) {
		if (!openFence) {
			const fence = lineStartsFence(line.text);
			if (fence) {
				openFence = { ...fence, from: line.from };
			}
			continue;
		}

		if (lineClosesFence(line.text, openFence)) {
			ranges.push({ from: openFence.from, to: line.to });
			openFence = null;
		}
	}

	if (openFence) {
		ranges.push({ from: openFence.from, to: doc.length });
	}

	return ranges;
};

const findDisplayDelimiterLine = (
	line: TextLine,
	excludedRanges: Range[]
): { delimiterFrom: number; delimiterTo: number; block: boolean } | null => {
	if (isPositionInRanges(line.from, excludedRanges)) {
		return null;
	}

	const { offset, hasMarkdownContainer } = markdownContainerContentOffset(line.text);
	if (!line.text.slice(offset).match(/^\$\$\s*$/)) {
		return null;
	}

	const delimiterFrom = line.from + offset;

	return {
		delimiterFrom,
		delimiterTo: delimiterFrom + 2,
		block: !hasMarkdownContainer && offset === 0,
	};
};

const stripBlockquotePrefix = (lineText: string): string => {
	let text = lineText;

	while (true) {
		const match = /^(?:[ \t]{0,3}>[ \t]?)/.exec(text);
		if (!match) {
			return text;
		}

		text = text.slice(match[0].length);
	}
};

const displaySourceFromLines = (lines: TextLine[]): string => {
	const quoteStrippedLines = lines.map(line => stripBlockquotePrefix(line.text));
	const contentLines = quoteStrippedLines.filter(line => line.trim().length > 0);
	if (contentLines.length === 0) {
		return '';
	}

	const commonIndent = Math.min(
		...contentLines.map(line => (/^[ \t]*/.exec(line)?.[0].length ?? 0))
	);

	return quoteStrippedLines
		.map(line => line.slice(Math.min(commonIndent, line.length)))
		.join('\n')
		.trim();
};

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
			const closingDelimiter = findDisplayDelimiterLine(closing, excludedRanges);
			if (!closingDelimiter) {
				continue;
			}

			const contentFrom = opening.to < doc.length ? opening.to + 1 : opening.to;
			const contentTo = closing.from;
			const source = displaySourceFromLines(lines.slice(index + 1, closeIndex));
			if (source.length > 0) {
				const block = openingDelimiter.block && closingDelimiter.block;

				expressions.push({
					kind: 'display',
					from: block ? opening.from : openingDelimiter.delimiterFrom,
					to: block ? closing.to : closingDelimiter.delimiterTo,
					contentFrom,
					contentTo,
					source,
					block,
					displayMode: block,
				});
			}

			index = closeIndex;
			break;
		}
	}

	return expressions;
};

const findInlineCodeRangesInLine = (line: TextLine): Range[] => {
	const ranges: Range[] = [];
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
				ranges.push({
					from: line.from + index,
					to: line.from + closeIndex + tickCount,
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

	return ranges;
};

const nextNonExcludedPosition = (position: number, ranges: Range[]): number => {
	const containingRange = ranges.find(range => position >= range.from && position < range.to);
	return containingRange ? containingRange.to : position;
};

const isDoubleDollarDelimiter = (doc: string, index: number): boolean =>
	doc[index] === '$' && doc[index + 1] === '$' && !isEscaped(doc, index);

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
						displayMode: false,
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

const isInlineOpeningDollar = (doc: string, index: number): boolean => {
	const next = doc[index + 1];
	if (doc[index] !== '$' || next === undefined || next === '$' || isEscaped(doc, index)) {
		return false;
	}

	if (/\d/.test(next)) {
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
	const fencedCodeRanges = findFencedCodeRanges(doc, lines);
	const displayExpressions = findDisplayMath(doc, lines, fencedCodeRanges);
	const displayRanges = displayExpressions.map(({ from, to }) => ({ from, to }));
	const inlineDisplayExpressions: MathExpression[] = [];

	for (const line of lines) {
		inlineDisplayExpressions.push(
			...findInlineDisplayMathInLine(doc, line, [
				...fencedCodeRanges,
				...displayRanges,
				...findInlineCodeRangesInLine(line),
			])
		);
	}

	const inlineDisplayRanges = inlineDisplayExpressions.map(({ from, to }) => ({ from, to }));
	const inlineExcludedRanges = [...fencedCodeRanges, ...displayRanges, ...inlineDisplayRanges];
	const inlineExpressions: MathExpression[] = [];

	for (const line of lines) {
		inlineExpressions.push(
			...findInlineMathInLine(doc, line, [
				...inlineExcludedRanges,
				...findInlineCodeRangesInLine(line),
			])
		);
	}

	return [...displayExpressions, ...inlineDisplayExpressions, ...inlineExpressions].sort((a, b) => a.from - b.from);
};
