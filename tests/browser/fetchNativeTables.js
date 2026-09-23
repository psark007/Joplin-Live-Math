const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const destination = path.resolve(__dirname, '../../.joplin-table-fixture');
const files = [
	['renderTables.ts', 'extensions/rendering/renderTables.ts', '7c83aed3fe5b2849cd94516d1e4482f661c7c8332ca7150abfcff47f8a163d82'],
	['tableUtils.ts', 'utils/markdown/tableUtils.ts', '2c490b8b7cf04a1ca178bed8f8972f2b538872c2bd127a1c4177bebe74d5a17d'],
];

async function main() {
	await fs.mkdir(destination, { recursive: true });
	for (const [name, source, hash] of files) {
		const target = path.join(destination, name);
		let data = await fs.readFile(target).catch(() => null);
		if (!data || createHash('sha256').update(data).digest('hex') !== hash) {
			const response = await fetch(`https://raw.githubusercontent.com/laurent22/joplin/v3.7.18/packages/editor/CodeMirror/${source}`, { signal: AbortSignal.timeout(30000) });
			if (!response.ok) throw new Error(`Fixture download failed: ${response.status} ${name}`);
			data = Buffer.from(await response.arrayBuffer());
			if (createHash('sha256').update(data).digest('hex') !== hash) throw new Error(`Fixture checksum mismatch: ${name}`);
			await fs.writeFile(target, data);
		}
	}
	console.info('Joplin 3.7.18 table fixtures verified. Upstream AGPL source is test-only and is not packaged.');
}
module.exports = { destination, files };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
