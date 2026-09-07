import { Window } from 'happy-dom';

export const dom = new Window({
	url: 'http://localhost/',
});

const browserGlobals = [
	'AbortController',
	'CustomEvent',
	'document',
	'Event',
	'EventTarget',
	'history',
	'HTMLElement',
	'location',
	'navigator',
	'Node',
	'window',
] as const;

for (const name of browserGlobals) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: dom[name],
		writable: true,
	});
}

export const resetDOM = (path = '/'): void => {
	document.body.replaceChildren();
	history.replaceState(null, '', path);
};
