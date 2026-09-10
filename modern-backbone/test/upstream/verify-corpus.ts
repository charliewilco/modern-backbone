import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const corpus = [
	{
		file: 'noconflict.js',
		tests: 1,
		sha256: 'ead708635785523822fa20c459764713508829c2a86c926cd81db3fec9f39623',
	},
	{
		file: 'debuginfo.js',
		tests: 1,
		sha256: '72724f58157e426e09034edb2bf799b6ec1e087bb074311b4ab81547c527b086',
	},
	{
		file: 'events.js',
		tests: 55,
		sha256: 'ea2dae8c91d220a89341298acb2e8e9b5112b3fb6ded11f726a0434026045887',
	},
	{
		file: 'model.js',
		tests: 112,
		sha256: '79e3b9bace7f194df249f7be4f2e8b100f703d0e614a14a96f5400ee472082cd',
	},
	{
		file: 'collection.js',
		tests: 144,
		sha256: 'fb35184d2ad0be474d4cdaff227007b269b72423753004eff64a1fd1fe013af0',
	},
	{
		file: 'router.js',
		tests: 77,
		sha256: 'e26cf8834fffe5e96c3748cf1d2d2b13ad562408a73456a0acf07525a47cdbde',
	},
	{
		file: 'view.js',
		tests: 34,
		sha256: 'bbcc067944c30a1066431c585e2b635975a3a909b417cbab3b5fe30e3382a828',
	},
	{
		file: 'sync.js',
		tests: 18,
		sha256: '5852df22f3fc0935c7e7ca567f5b4bb479b2cea41545de5213e6bcad9f53810c',
	},
] as const;

export const upstreamSuiteFiles = corpus.map(({ file }) =>
	fileURLToPath(new URL(`./vendor/${file}`, import.meta.url)),
);

export const verifyCorpus = (): number => {
	let total = 0;

	for (const suite of corpus) {
		const source = readFileSync(new URL(`./vendor/${suite.file}`, import.meta.url), 'utf8');
		const digest = createHash('sha256').update(source).digest('hex');
		const tests = [...source.matchAll(/\bQUnit\.test\s*\(/g)].length;

		assert.strictEqual(digest, suite.sha256, `${suite.file} does not match the pinned source`);
		assert.strictEqual(tests, suite.tests, `${suite.file} test count changed`);
		total += tests;
	}

	assert.strictEqual(total, 442, 'upstream QUnit corpus must contain 442 tests');
	return total;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tests = verifyCorpus();
	console.log(`Backbone 1.6.1 oracle verified: ${tests} QUnit cases + 1 inheritance smoke = 443`);
}
