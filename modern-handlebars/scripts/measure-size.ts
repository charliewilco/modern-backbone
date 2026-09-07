import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

interface Measurement {
	bytes: number;
	code: number;
	physical: number;
}

function measure(source: string): Measurement {
	const lines = source.split('\n');
	return {
		bytes: Buffer.byteLength(source),
		code: lines.filter((line) => {
			const text = line.trim();
			return text.length > 0 && !text.startsWith('//');
		}).length,
		physical: lines.at(-1) === '' ? lines.length - 1 : lines.length,
	};
}

const authored = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const emitted = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
const authoredSize = measure(authored);
const emittedSize = measure(emitted);

console.log(
	`authored TypeScript  ${authoredSize.code} code / ${authoredSize.physical} physical / ${(authoredSize.bytes / 1_000).toFixed(2)} kB`,
);
console.log(
	`emitted JavaScript ${emittedSize.code} code / ${emittedSize.physical} physical / ${(emittedSize.bytes / 1_000).toFixed(2)} kB / ${(gzipSync(emitted).byteLength / 1_000).toFixed(2)} kB gzip`,
);
