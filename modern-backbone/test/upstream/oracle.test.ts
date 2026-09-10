import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createQUnit } from './qunit-adapter.js';
import { upstreamSuiteFiles, verifyCorpus } from './verify-corpus.js';

type Callable = (this: unknown, ...arguments_: unknown[]) => unknown;
type MutableBackbone = Record<string, unknown> & {
	VERSION: string;
};

Object.defineProperty(globalThis, 'self', {
	configurable: true,
	value: window,
	writable: true,
});

const require = createRequire(import.meta.url);
const Backbone = require('backbone') as MutableBackbone;
const underscore = require('underscore') as Record<string, unknown>;
const jquery = Backbone.$;

Backbone.debugInfo = require('backbone/debug-info.js') as Callable;
assert.strictEqual(Backbone.VERSION, '1.6.1');
assert.ok(jquery, 'Backbone must load jQuery against Happy DOM');

const qunit = createQUnit();
const globals = {
	$: jquery,
	Backbone,
	QUnit: qunit,
	_: underscore,
	jQuery: jquery,
};

Object.assign(globalThis, globals);
Object.assign(window, globals);

document.body.innerHTML = '<div id="qunit"></div><div id="qunit-fixture"></div>';

const original = {
	ajax: Backbone.ajax,
	emulateHTTP: Backbone.emulateHTTP,
	emulateJSON: Backbone.emulateJSON,
	pushState: history.pushState,
	replaceState: history.replaceState,
	sync: Backbone.sync,
};

qunit.config.noglobals = true;
qunit.testStart(() => {
	const environment = qunit.config.current.testEnvironment;
	history.pushState = history.replaceState = () => undefined;

	Backbone.ajax = (settings: unknown) => {
		environment.ajaxSettings = settings;
	};

	Backbone.sync = function (this: unknown, ...arguments_: unknown[]) {
		environment.syncArgs = {
			method: arguments_[0],
			model: arguments_[1],
			options: arguments_[2],
		};
		return (original.sync as Callable).apply(this, arguments_);
	};
});

qunit.testDone(() => {
	Backbone.sync = original.sync;
	Backbone.ajax = original.ajax;
	Backbone.emulateHTTP = original.emulateHTTP;
	Backbone.emulateJSON = original.emulateJSON;
	history.pushState = original.pushState;
	history.replaceState = original.replaceState;
});

verifyCorpus();
for (const file of upstreamSuiteFiles) {
	vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });
}

assert.strictEqual(qunit.registeredTests, 442, 'QUnit adapter must register the full corpus');
