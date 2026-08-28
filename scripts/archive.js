const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tar = require('tar');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publishDir = path.join(rootDir, 'publish');
const manifestPath = path.join(distDir, 'manifest.json');

const walkFiles = dir => {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkFiles(fullPath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
};

const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(manifestPath)) {
	throw new Error('Cannot create .jpl: dist/manifest.json does not exist. Run the webpack build first.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.id) {
	throw new Error('Cannot create .jpl: manifest.id is missing.');
}

fs.mkdirSync(publishDir, { recursive: true });

const files = walkFiles(distDir).map(file => path.relative(distDir, file));
if (files.length === 0) {
	throw new Error('Cannot create .jpl: dist/ is empty.');
}

const archivePath = path.join(publishDir, `${manifest.id}.jpl`);
if (fs.existsSync(archivePath)) {
	fs.unlinkSync(archivePath);
}

tar.create(
	{
		cwd: distDir,
		file: archivePath,
		portable: true,
		strict: true,
		sync: true,
	},
	files
);

const pluginInfo = {
	...manifest,
	_publish_hash: `sha256:${sha256(archivePath)}`,
};

fs.writeFileSync(path.join(publishDir, `${manifest.id}.json`), JSON.stringify(pluginInfo, null, '\t'), 'utf8');
console.info(`Plugin archive created at ${path.relative(rootDir, archivePath)}`);
