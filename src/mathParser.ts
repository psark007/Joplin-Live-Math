export type MathExpressionKind = 'inline' | 'display';

export interface MathExpression {
	kind: MathExpressionKind;
	from: number;
	to: number;
	contentFrom: number;
	contentTo: number;
	source: string;
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

const isDisplayDelimiterLine = (line: TextLine, excludedRanges: Range[]): boolean => {
	if (isPositionInRanges(line.from, excludedRanges)) {
		return false;
	}

	return line.text.trim() === '$$';
};

const findDisplayMath = (doc: string, lines: TextLine[], excludedRanges: Range[]): MathExpression[] => {
	const expressions: MathExpression[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const opening = lines[index];
		if (!isDisplayDelimiterLine(opening, excludedRanges)) {
			continue;
		}

		for (let closeIndex = index + 1; closeIndex < lines.length; closeIndex += 1) {
			const closing = lines[closeIndex];
			if (!isDisplayDelimiterLine(closing, excludedRanges)) {
				continue;
			}

			const contentFrom = opening.to < doc.length ? opening.to + 1 : opening.to;
			const contentTo = closing.from;
			const source = doc.slice(contentFrom, contentTo).trim();
			if (source.length > 0) {
				expressions.push({
					kind: 'display',
					from: opening.from,
					to: closing.to,
					contentFrom,
					contentTo,
					source,
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

const isInlineOpeningDollar = (doc: string, index: number): boolean => {
	const next = doc[index + 1];
	if (doc[index] !== '$' || next === undefined || next === '$' || isEscaped(doc, index)) {
		return false;
	}

	if (/\s|\d/.test(next)) {
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

	if (/\s/.test(previous)) {
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
	const inlineExcludedRanges = [...fencedCodeRanges, ...displayRanges];
	const inlineExpressions: MathExpression[] = [];

	for (const line of lines) {
		if (inlineExcludedRanges.some(range => intersects(line.from, line.to, range))) {
			continue;
		}

		inlineExpressions.push(
			...findInlineMathInLine(doc, line, [
				...inlineExcludedRanges,
				...findInlineCodeRangesInLine(line),
			])
		);
	}

	return [...displayExpressions, ...inlineExpressions].sort((a, b) => a.from - b.from);
};
