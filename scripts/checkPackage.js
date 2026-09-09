const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const tar = require('tar');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');

const rootDir = path.resolve(__dirname, '..');
const archivePath = path.join(rootDir, 'publish/Joplin-Live-Math.jpl');
const files = new Map();
tar.t({
	file: archivePath,
	sync: true,
	onReadEntry(entry) {
		const chunks = [];
		entry.on('data', chunk => chunks.push(chunk));
		entry.on('end', () => files.set(entry.path, Buffer.concat(chunks)));
	},
});

const read = name => {
	assert(files.has(name), `Archive is missing ${name}`);
	return files.get(name).toString('utf8');
};
const manifest = JSON.parse(read('manifest.json'));
const sourceManifest = require('../src/manifest.json');
assert.deepEqual(manifest, sourceManifest);
assert.equal(manifest.version, require('../package.json').version);
read('styles.css');
read('LICENSE.md');
read('THIRD_PARTY_NOTICES.md');
assert.equal(read('licenses/KaTeX-LICENSE.txt'), fs.readFileSync(path.join(path.dirname(require.resolve('katex')), '../LICENSE'), 'utf8'));

let fontCount = 0;
postcss.parse(read('katex.min.css')).walkAtRules('font-face', rule => {
	rule.walkDecls('src', declaration => {
		valueParser(declaration.value).walk(node => {
			if (node.type === 'function' && node.value === 'url') {
				assert(node.nodes[0].value.startsWith('data:font/woff2;base64,'), 'Font must be embedded');
				fontCount += 1;
			}
		});
	});
});
assert(fontCount > 0, 'Archive must contain fonts');

let registration;
const mainModule = { exports: {} };
vm.runInNewContext(read('index.js'), {
	module: mainModule,
	exports: mainModule.exports,
	joplin: { plugins: { register: plugin => { registration = plugin; } } },
	require: name => { throw new Error(`Unexpected main-script import: ${name}`); },
}, { timeout: 1000 });
assert.equal(typeof registration?.onStart, 'function', 'Plugin must register with Joplin');

const contentScriptExports = {};
vm.runInNewContext(read('contentScript.js'), {
	module: { exports: contentScriptExports },
	exports: contentScriptExports,
	require: name => {
		assert(['@codemirror/state', '@codemirror/view', '@lezer/markdown'].includes(name), `Unexpected editor import: ${name}`);
		return require(name);
	},
}, { timeout: 1000 });
assert.equal(typeof contentScriptExports.default, 'function', 'Content script must export a plugin factory');

const metadata = require('../publish/Joplin-Live-Math.json');
const hash = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
assert.equal(metadata._publish_hash, `sha256:${hash}`);
assert.equal(metadata.version, manifest.version);
console.info(`Verified v${manifest.version}: entry points, metadata, licenses, and ${fontCount} embedded fonts.`);
