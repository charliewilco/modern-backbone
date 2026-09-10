type ElementConstructor<Element extends HTMLElement> = new () => Element;

export function requiredElement<Element extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<Element>,
): Element {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}
