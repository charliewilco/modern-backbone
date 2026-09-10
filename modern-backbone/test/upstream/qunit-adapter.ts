import assert from 'node:assert';
import { test } from 'node:test';

type TestEnvironment = Record<string, unknown>;
type TestCallback = (this: TestEnvironment, assert: QUnitAssert) => unknown;
type LifecycleCallback = (this: TestEnvironment, assert: QUnitAssert) => unknown;

interface ModuleHooks {
	afterEach?: LifecycleCallback;
	beforeEach?: LifecycleCallback;
}

interface QUnitConfig {
	current: { testEnvironment: TestEnvironment };
	noglobals?: boolean;
}

const messageText = (message: unknown): string | undefined =>
	message === undefined ? undefined : String(message);

class QUnitAssert {
	#actual = 0;
	#asyncUsed = false;
	#expected: number | undefined;
	#failure: unknown;
	#pending = 0;
	#pendingPromise: Promise<void> | undefined;
	#resolvePending: (() => void) | undefined;

	async(count = 1): () => void {
		assert.ok(
			Number.isInteger(count) && count > 0,
			'assert.async count must be a positive integer',
		);
		this.#asyncUsed = true;
		this.#pending += count;

		if (!this.#pendingPromise) {
			this.#pendingPromise = new Promise((resolve) => {
				this.#resolvePending = resolve;
			});
		}

		let remaining = count;
		return () => {
			if (remaining === 0) {
				this.#failure ??= new Error('assert.async callback called too many times');
				return;
			}

			remaining -= 1;
			this.#pending -= 1;
			if (this.#pending === 0) this.#resolvePending?.();
		};
	}

	deepEqual(actual: unknown, expected: unknown, message?: unknown): void {
		this.#check(() => assert.deepEqual(actual, expected, messageText(message)));
	}

	equal(actual: unknown, expected: unknown, message?: unknown): void {
		this.#check(() => assert.equal(actual, expected, messageText(message)));
	}

	expect(count: number): void {
		this.#expected = count;
	}

	notEqual(actual: unknown, expected: unknown, message?: unknown): void {
		this.#check(() => assert.notEqual(actual, expected, messageText(message)));
	}

	notOk(value: unknown, message?: unknown): void {
		this.#check(() => assert.ok(!value, messageText(message)));
	}

	ok(value: unknown, message?: unknown): void {
		this.#check(() => assert.ok(value, messageText(message)));
	}

	raises(block: () => unknown, message?: unknown): void {
		this.#check(() => assert.throws(block, messageText(message)));
	}

	strictEqual(actual: unknown, expected: unknown, message?: unknown): void {
		this.#check(() => assert.strictEqual(actual, expected, messageText(message)));
	}

	async settle(): Promise<void> {
		if (this.#pending > 0) await this.#pendingPromise;
	}

	verify(): void {
		if (this.#failure) throw this.#failure;
		if (this.#expected !== undefined) {
			assert.strictEqual(
				this.#actual,
				this.#expected,
				`Expected ${this.#expected} assertions, but received ${this.#actual}`,
			);
		}
	}

	#check(operation: () => void): void {
		this.#actual += 1;
		try {
			operation();
		} catch (error) {
			if (!this.#asyncUsed) throw error;
			this.#failure ??= error;
		}
	}
}

export interface QUnitAdapter {
	config: QUnitConfig;
	module(name: string, hooks?: ModuleHooks): void;
	registeredTests: number;
	test(name: string, callback: TestCallback): void;
	testDone(callback: LifecycleCallback): void;
	testStart(callback: LifecycleCallback): void;
}

export const createQUnit = (): QUnitAdapter => {
	let currentHooks: ModuleHooks = {};
	let currentModule = '';
	const testDoneCallbacks: LifecycleCallback[] = [];
	const testStartCallbacks: LifecycleCallback[] = [];

	const qunit: QUnitAdapter = {
		config: {
			current: { testEnvironment: {} },
		},
		module(name, hooks = {}) {
			currentModule = name;
			currentHooks = hooks;
		},
		registeredTests: 0,
		test(name, callback) {
			const hooks = currentHooks;
			const moduleName = currentModule;
			qunit.registeredTests += 1;

			test(`${moduleName}: ${name}`, { concurrency: false, timeout: 5_000 }, async () => {
				const assertions = new QUnitAssert();
				const environment: TestEnvironment = {};
				qunit.config.current = { testEnvironment: environment };
				document.querySelector('#qunit-fixture')?.replaceChildren();

				let failure: unknown;
				try {
					for (const start of testStartCallbacks) await start.call(environment, assertions);
					await hooks.beforeEach?.call(environment, assertions);
					await callback.call(environment, assertions);
					await assertions.settle();
				} catch (error) {
					failure = error;
				} finally {
					try {
						await hooks.afterEach?.call(environment, assertions);
					} catch (error) {
						failure ??= error;
					}

					for (const done of testDoneCallbacks) {
						try {
							await done.call(environment, assertions);
						} catch (error) {
							failure ??= error;
						}
					}
				}

				if (failure) throw failure;
				assertions.verify();
			});
		},
		testDone(callback) {
			testDoneCallbacks.push(callback);
		},
		testStart(callback) {
			testStartCallbacks.push(callback);
		},
	};

	return qunit;
};
