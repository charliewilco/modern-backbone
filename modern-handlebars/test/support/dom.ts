import { Window } from 'happy-dom';

export const dom = new Window({ url: 'http://localhost/' });

const browserGlobals = [
	'Comment',
	'DocumentFragment',
	'HTMLElement',
	'Node',
	'document',
	'window',
] as const;

for (const name of browserGlobals) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: dom[name],
		writable: true,
	});
}
