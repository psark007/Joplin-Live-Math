import { describe, expect, it } from 'vitest';
import { tableCellSources } from '../src/tableMathRendering';

describe('native table source mapping', () => {
	it('maps headers, body rows, and empty columns without shifting math', () => {
		expect(tableCellSources('| A | B | C |\n| - | - | - |\n| | $x$ | |')).toEqual([
			['A', 'B', 'C'], ['', '$x$', ''],
		]);
	});
	it('supports optional outer pipes and pads missing cells', () => {
		expect(tableCellSources('A | B\n--- | ---\n$x$')).toEqual([['A', 'B'], ['$x$', '']]);
	});
	it('does not interpret escaped pipes as new columns', () => {
		expect(tableCellSources('| A | B |\n| - | - |\n| $\\lvert x\\rvert$ | $x\\|y$ |')).toEqual([
			['A', 'B'], [String.raw`$\lvert x\rvert$`, '$x|y$'],
		]);
	});
	it('ignores whitespace around optional outer pipes', () => {
		expect(tableCellSources('  | A | B |  \n  | - | - |  \n  | $x$ | y |  ')).toEqual([['A', 'B'], ['$x$', 'y']]);
	});
	it.each(['not a table', '| A |\n| $x$ |', '| A |\n| - |\n| x |\n\nextra'])('rejects unsupported source: %s', source => {
		expect(tableCellSources(source)).toBeNull();
	});
});
