const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const userConfig = require('./plugin.config.json');

const rootDir = __dirname;
const distDir = path.resolve(rootDir, 'dist');

const externalRuntimeModules = ({ request }, callback) => {
	if (
		(request && request.startsWith('@codemirror/')) ||
		(request && request.startsWith('@lezer/'))
	) {
		callback(null, `commonjs ${request}`);
		return;
	}

	callback();
};

const baseConfig = {
	mode: 'production',
	target: 'node',
	stats: 'errors-warnings',
	externals: [externalRuntimeModules],
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		alias: {
			api: path.resolve(rootDir, 'api'),
		},
		extensions: ['.tsx', '.ts', '.js'],
	},
};

const mainConfig = {
	...baseConfig,
	entry: './src/index.ts',
	output: {
		filename: 'index.js',
		path: distDir,
		libraryTarget: 'commonjs2',
		clean: true,
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'src/manifest.json', to: 'manifest.json' },
				{ from: 'src/styles.css', to: 'styles.css' },
				{ from: 'node_modules/katex/dist/katex.min.css', to: 'katex.min.css' },
				{ from: 'node_modules/katex/dist/fonts', to: 'fonts' },
				{ from: 'LICENSE', to: 'LICENSE.md' },
				{ from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
			],
		}),
	],
};

const buildExtraScriptConfig = scriptName => {
	const outputName = scriptName.replace(/\.[^.]+$/, '.js');

	return {
		...baseConfig,
		entry: `./src/${scriptName}`,
		output: {
			filename: outputName,
			path: distDir,
			library: 'default',
			libraryTarget: 'commonjs',
			libraryExport: 'default',
		},
	};
};

module.exports = env => {
	const configName = env && env['joplin-plugin-config'];

	if (configName === 'buildMain') {
		return mainConfig;
	}

	if (configName === 'buildExtraScripts') {
		return userConfig.extraScripts.map(buildExtraScriptConfig);
	}

	throw new Error('Expected --env joplin-plugin-config=buildMain or buildExtraScripts');
};
