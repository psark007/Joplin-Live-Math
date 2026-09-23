const { mkdtempSync, rmSync, existsSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const webpack = require('webpack');
const { destination: nativeDir, files: nativeFiles } = require('./fetchNativeTables');

module.exports = async () => {
	const outputDir = mkdtempSync(path.join(tmpdir(), 'live-math-editor-test-'));
	const nativeTables = nativeFiles.every(([name, , hash]) => {
		const file = path.join(nativeDir, name);
		return existsSync(file) && createHash('sha256').update(readFileSync(file)).digest('hex') === hash;
	});
	const host = path.join(__dirname, 'nativeTableHost.ts');
	try {
		await new Promise((resolve, reject) => {
			const compiler = webpack({
				mode: 'development',
				devtool: false,
				target: 'web',
				entry: path.join(__dirname, 'editorFixture.ts'),
				output: { path: outputDir, filename: 'editor.js' },
				resolve: {
					extensions: ['.ts', '.js'],
					alias: {
						'joplin-native-tables': nativeTables ? path.join(nativeDir, 'renderTables.ts') : path.join(__dirname, 'nativeTablesUnavailable.ts'),
						'./utils/makeBlockReplaceExtension': host,
						'@joplin/lib/utils/focusHandler': host,
						'@codemirror/search': host,
						'../editorSettingsExtension': host,
						'../../editorCommands/tableCommands': host,
						'../../utils/markdown/tableUtils': path.join(nativeDir, 'tableUtils.ts'),
						'../../../ProseMirror/utils/sanitizeHtml': path.join(__dirname, 'nativeTableSanitize.ts'),
					},
				},
				plugins: [new webpack.DefinePlugin({ __NATIVE_TABLES_AVAILABLE__: JSON.stringify(nativeTables) })],
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
