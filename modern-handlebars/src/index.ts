export type TemplatePrimitive = string | number | bigint | symbol | boolean | null | undefined;

export type TemplateValue = TemplatePrimitive | Node | Iterable<TemplateValue>;

type Slot =
	| { kind: 'attribute'; name: string }
	| { kind: 'child' }
	| { kind: 'raw-text' }
	| { kind: 'unsupported' };

const rawTextElements = new Set(['script', 'style', 'textarea', 'title']);

const createTemplate = (ownerDocument: Document, markup: string): HTMLTemplateElement => {
	const template = ownerDocument.createElement('template');
	template.innerHTML = markup;
	return template;
};

const markerBase = (strings: TemplateStringsArray): string => {
	let suffix = 0;
	let base = 'modern-hbs-slot-';

	while (strings.some((part) => part.includes(base))) {
		suffix += 1;
		base = `modern-hbs-${suffix}-slot-`;
	}

	return base;
};

const walk = (root: Node, visit: (node: Node) => void): void => {
	for (const node of root.childNodes) {
		visit(node);
		walk(node, visit);
	}
};

const classifySlots = (
	ownerDocument: Document,
	strings: TemplateStringsArray,
	markers: readonly string[],
): Slot[] => {
	let markup = strings[0] ?? '';
	for (const [index, marker] of markers.entries()) {
		markup += marker;
		markup += strings[index + 1] ?? '';
	}

	const slots: Slot[] = markers.map(() => ({ kind: 'unsupported' }));
	const occurrences = markers.map(() => 0);
	const probe = createTemplate(ownerDocument, markup);

	walk(probe.content, (node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const parentName = node.parentElement?.localName;
			for (const [index, marker] of markers.entries()) {
				if (node.nodeValue?.includes(marker)) {
					occurrences[index] = (occurrences[index] ?? 0) + 1;
					slots[index] = rawTextElements.has(parentName ?? '')
						? { kind: 'raw-text' }
						: { kind: 'child' };
				}
			}
			return;
		}

		if (node.nodeType === Node.COMMENT_NODE) {
			for (const [index, marker] of markers.entries()) {
				if (node.nodeValue?.includes(marker)) {
					occurrences[index] = (occurrences[index] ?? 0) + 1;
				}
			}
			return;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		const element = node as Element;
		for (const [index, marker] of markers.entries()) {
			if (element.localName.includes(marker)) {
				occurrences[index] = (occurrences[index] ?? 0) + 1;
			}
		}

		for (const attribute of element.attributes) {
			for (const [index, marker] of markers.entries()) {
				if (attribute.name.includes(marker)) {
					occurrences[index] = (occurrences[index] ?? 0) + 1;
				}
				if (attribute.value.includes(marker)) {
					occurrences[index] = (occurrences[index] ?? 0) + 1;
					slots[index] = { kind: 'attribute', name: attribute.name };
				}
			}
		}
	});

	for (const [index, slot] of slots.entries()) {
		if (occurrences[index] !== 1 || slot.kind === 'unsupported') {
			throw new TypeError(`Unsupported interpolation position at slot ${index}`);
		}
		if (slot.kind === 'raw-text') {
			throw new TypeError(
				`Interpolation inside raw-text elements is not supported at slot ${index}`,
			);
		}
		if (slot.kind === 'attribute' && slot.name.toLowerCase().startsWith('on')) {
			throw new TypeError(`Dynamic event-handler attribute ${slot.name} is not supported`);
		}
		if (slot.kind === 'attribute' && slot.name.toLowerCase() === 'srcdoc') {
			throw new TypeError('Dynamic srcdoc attributes are not supported');
		}
	}

	return slots;
};

const isNode = (value: unknown): value is Node =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as Node).nodeType === 'number' &&
	typeof (value as Node).cloneNode === 'function';

const isIterable = (value: unknown): value is Iterable<unknown> =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';

const appendValue = (ownerDocument: Document, parent: DocumentFragment, value: unknown): void => {
	if (value === null || value === undefined || typeof value === 'boolean') {
		return;
	}

	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'symbol'
	) {
		parent.append(ownerDocument.createTextNode(String(value)));
		return;
	}

	if (isNode(value)) {
		parent.append(value);
		return;
	}

	if (isIterable(value)) {
		for (const item of value) {
			appendValue(ownerDocument, parent, item);
		}
		return;
	}

	throw new TypeError('Child interpolations must be primitives, DOM nodes, or iterables');
};

const attributeText = (value: unknown): string => {
	if (value === null || value === undefined || typeof value === 'boolean') {
		return '';
	}
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'symbol'
	) {
		return String(value);
	}
	throw new TypeError('Attribute interpolations must be primitive values');
};

const resolveAttributes = (
	fragment: DocumentFragment,
	markers: readonly string[],
	values: readonly unknown[],
): void => {
	walk(fragment, (node) => {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		const element = node as Element;
		for (const attribute of Array.from(element.attributes)) {
			const indexes = markers.flatMap((marker, index) =>
				attribute.value.includes(marker) ? [index] : [],
			);
			if (indexes.length === 0) {
				continue;
			}

			const firstIndex = indexes[0];
			if (
				firstIndex !== undefined &&
				indexes.length === 1 &&
				attribute.value === markers[firstIndex]
			) {
				const value = values[firstIndex];
				if (value === false || value === null || value === undefined) {
					element.removeAttributeNode(attribute);
				} else if (value === true) {
					attribute.value = '';
				} else {
					attribute.value = attributeText(value);
				}
				continue;
			}

			let result = attribute.value;
			for (const index of indexes) {
				result = result.replaceAll(markers[index] ?? '', attributeText(values[index]));
			}
			attribute.value = result;
		}
	});
};

const resolveChildren = (
	ownerDocument: Document,
	fragment: DocumentFragment,
	markers: readonly string[],
	values: readonly unknown[],
): void => {
	const comments: Comment[] = [];
	walk(fragment, (node) => {
		if (node.nodeType === Node.COMMENT_NODE && markers.includes(node.nodeValue ?? '')) {
			comments.push(node as Comment);
		}
	});

	for (const comment of comments) {
		const index = markers.indexOf(comment.data);
		const replacement = ownerDocument.createDocumentFragment();
		appendValue(ownerDocument, replacement, values[index]);
		comment.replaceWith(replacement);
	}
};

export function hbs(
	strings: TemplateStringsArray,
	...values: readonly TemplateValue[]
): DocumentFragment {
	const ownerDocument = globalThis.document;
	if (!ownerDocument) {
		throw new Error('hbs requires a browser document');
	}

	const base = markerBase(strings);
	const markers = values.map((_, index) => `${base}${index}-x`);
	const slots = classifySlots(ownerDocument, strings, markers);

	let markup = strings[0] ?? '';
	for (const [index, marker] of markers.entries()) {
		markup += slots[index]?.kind === 'child' ? `<!--${marker}-->` : marker;
		markup += strings[index + 1] ?? '';
	}

	const fragment = createTemplate(ownerDocument, markup).content;
	resolveAttributes(fragment, markers, values);
	resolveChildren(ownerDocument, fragment, markers, values);
	return fragment;
}
