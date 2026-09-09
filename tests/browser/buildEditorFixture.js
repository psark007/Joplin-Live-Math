const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const webpack = require('webpack');

module.exports = async () => {
	const outputDir = mkdtempSync(path.join(tmpdir(), 'live-math-editor-test-'));
	try {
		await new Promise((resolve, reject) => {
			const compiler = webpack({
				mode: 'development',
				devtool: false,
				target: 'web',
				entry: path.join(__dirname, 'editorFixture.ts'),
				output: { path: outputDir, filename: 'editor.js' },
				resolve: { extensions: ['.ts', '.js'] },
				module: { rules: [{ test: /\.ts$/, use: { loader: 'ts-loader', options: { transpileOnly: true } } }] },
			});
			compiler.run((error, stats) => {
				compiler.close(closeError => {
					if (error || closeError) reject(error || closeError);
					else if (stats.hasErrors()) reject(new Error(stats.toString('errors-only')));
					else resolve();
				});
			});
		});
	} catch (error) {
		rmSync(outputDir, { recursive: true, force: true });
		throw error;
	}
	process.env.LIVE_MATH_EDITOR_FIXTURE = path.join(outputDir, 'editor.js');
	return () => rmSync(outputDir, { recursive: true, force: true });
};
