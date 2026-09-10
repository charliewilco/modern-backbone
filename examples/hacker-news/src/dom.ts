type ElementConstructor<T extends HTMLElement> = new () => T;

export function requiredElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<T>,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}
