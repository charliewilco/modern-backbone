type PathParameterNames<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
	? (Segment extends `:${infer Name}` ? Name : never) | PathParameterNames<Rest>
	: Path extends `:${infer Name}`
		? Name
		: never;

export type RouteParams<Pattern extends string> = Record<PathParameterNames<Pattern>, string>;
export type RouteHandler<Pattern extends string> = (params: RouteParams<Pattern>) => void;
export type RouteFallbackHandler = (pathname: string) => void;

export interface RouterNavigateOptions {
	replace?: boolean;
}

type MatchedParams = Record<string, string>;
type Matcher = (path: string) => MatchedParams | null;

interface RegisteredRoute {
	handler: (params: MatchedParams) => void;
	match: Matcher;
}

const parameter = /^:[A-Za-z_][A-Za-z0-9_]*$/;

const normalizePathname = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

const validPattern = (pattern: string): boolean => {
	const parts = pattern.slice(1).split('/');
	const names = parts.filter((part) => parameter.test(part));
	return (
		pattern === '/' ||
		(pattern.startsWith('/') &&
			parts.every(
				(part) => parameter.test(part) || (part.length > 0 && !/[:*+?(){}]/.test(part)),
			) &&
			new Set(names).size === names.length)
	);
};

const decode = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const compileFallback = (pattern: string): Matcher => {
	const expected = pattern.split('/');
	return (path) => {
		const actual = normalizePathname(path).split('/');
		if (actual.length !== expected.length) return null;

		const params: MatchedParams = {};
		for (const [index, expectedPart] of expected.entries()) {
			const actualPart = actual[index] ?? '';
			if (parameter.test(expectedPart)) params[expectedPart.slice(1)] = decode(actualPart);
			else if (decode(actualPart) !== decode(expectedPart)) return null;
		}
		return params;
	};
};

const compile = (pattern: string): Matcher => {
	if (typeof URLPattern === 'function') {
		const urlPattern = new URLPattern({ pathname: pattern });
		return (path) => {
			const groups = urlPattern.exec({ pathname: normalizePathname(path) })?.pathname.groups;
			return groups
				? Object.fromEntries(
						Object.entries(groups).map(([name, value]) => [name, decode(value ?? '')]),
					)
				: null;
		};
	}
	return compileFallback(pattern);
};

export class Router {
	#fallback: RouteFallbackHandler | undefined;
	#routes: RegisteredRoute[] = [];
	#lifetime: AbortController | undefined;

	route<const Pattern extends `/${string}`>(
		pattern: Pattern,
		handler: RouteHandler<Pattern>,
	): this {
		if (!pattern.startsWith('/')) throw new TypeError('Route patterns must start with /');
		const normalizedPattern = normalizePathname(pattern);
		if (!validPattern(normalizedPattern)) throw new TypeError(`Invalid route pattern: ${pattern}`);
		this.#routes.push({
			handler: (params) => handler(params as RouteParams<Pattern>),
			match: compile(normalizedPattern),
		});
		return this;
	}

	fallback(handler: RouteFallbackHandler): this {
		this.#fallback = handler;
		return this;
	}

	start(): this {
		if (this.#lifetime) return this;
		this.#lifetime = new AbortController();
		window.addEventListener('popstate', () => this.#resolve(location.pathname), {
			signal: this.#lifetime.signal,
		});
		this.#resolve(location.pathname);
		return this;
	}

	stop(): this {
		this.#lifetime?.abort();
		this.#lifetime = undefined;
		return this;
	}

	navigate(path: string, { replace = false }: RouterNavigateOptions = {}): this {
		history[replace ? 'replaceState' : 'pushState'](null, '', path);
		this.#resolve(location.pathname);
		return this;
	}

	#resolve(path: string): boolean {
		for (const route of this.#routes) {
			const params = route.match(path);
			if (params) {
				route.handler(params);
				return true;
			}
		}
		this.#fallback?.(path);
		return false;
	}
}
