import { readFile } from 'node:fs/promises';

interface Measurement {
	code: number;
	physical: number;
	bytes: number;
}

function count(source: string): Measurement {
	const lines = source.split('\n');
	let code = 0;
	let inComment = false;

	for (const line of lines) {
		const text = line.trim();
		if (inComment) {
			if (text.includes('*/')) inComment = false;
			continue;
		}
		if (text.startsWith('/*')) {
			if (!text.includes('*/')) inComment = true;
			continue;
		}
		if (text.length > 0 && !text.startsWith('//')) code += 1;
	}

	return {
		bytes: Buffer.byteLength(source),
		code,
		physical: lines.at(-1) === '' ? lines.length - 1 : lines.length,
	};
}

async function measure(label: string, directory: string, files: string[]): Promise<void> {
	const total: Measurement = { bytes: 0, code: 0, physical: 0 };
	console.log(label);
	for (const file of files) {
		const measurement = count(
			await readFile(new URL(`${directory}${file}`, import.meta.url), 'utf8'),
		);
		total.bytes += measurement.bytes;
		total.code += measurement.code;
		total.physical += measurement.physical;
		console.log(
			`${file.padEnd(14)} ${String(measurement.code).padStart(3)} code / ${String(measurement.physical).padStart(3)} physical`,
		);
	}
	console.log(
		`${'total'.padEnd(14)} ${String(total.code).padStart(3)} code / ${String(total.physical).padStart(3)} physical / ${(total.bytes / 1_000).toFixed(1)} kB`,
	);
}

await measure('authored TypeScript', '../src/', [
	'collection.ts',
	'index.ts',
	'model.ts',
	'router.ts',
	'view.ts',
]);
await measure('emitted JavaScript', '../dist/', ['index.js']);
