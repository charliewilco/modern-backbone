import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface TodoRecord {
	id: number;
	title: string;
	completed: boolean;
}

interface ResolvedStaticPath {
	canFallback: boolean;
	path: string;
}

const workspaceDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(workspaceDirectory, 'dist');
const indexPath = resolve(distDirectory, 'index.html');
const contentTypes: ReadonlyMap<string, string> = new Map([
	['.css', 'text/css; charset=utf-8'],
	['.html', 'text/html; charset=utf-8'],
	['.ico', 'image/x-icon'],
	['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'],
	['.js', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.map', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml; charset=utf-8'],
	['.webp', 'image/webp'],
	['.woff2', 'font/woff2'],
]);

let nextId = 3;
const todos: TodoRecord[] = [
	{ id: 1, title: 'Read the four primitives', completed: true },
	{ id: 2, title: 'Build something small', completed: false },
];

function sendJSON(response: ServerResponse, status: number, value?: unknown): void {
	const body = value === undefined ? '' : JSON.stringify(value);
	response.writeHead(status, {
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(body),
		'content-type': 'application/json; charset=utf-8',
	});
	response.end(body);
}

async function readJSON(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > 16_384) throw new RangeError('Request body is too large');
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function normalizedTodo(body: unknown, id: number): TodoRecord {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new TypeError('Todo must be a JSON object');
	}
	const record = body as Record<string, unknown>;
	if (typeof record.title !== 'string' || record.title.trim().length === 0) {
		throw new TypeError('Todo title is required');
	}
	return {
		id,
		title: record.title.trim().slice(0, 120),
		completed: record.completed === true,
	};
}

async function handleAPI(
	request: IncomingMessage,
	response: ServerResponse,
	pathname: string,
): Promise<void> {
	if (pathname === '/api/todos') {
		if (request.method === 'GET') {
			sendJSON(response, 200, todos);
			return;
		}
		if (request.method === 'POST') {
			const todo = normalizedTodo(await readJSON(request), nextId);
			nextId += 1;
			todos.push(todo);
			sendJSON(response, 201, todo);
			return;
		}
		response.setHeader('allow', 'GET, POST');
		sendJSON(response, 405, { error: 'Method not allowed' });
		return;
	}

	const match = /^\/api\/todos\/(\d+)$/.exec(pathname);
	const idText = match?.[1];
	if (idText === undefined) {
		sendJSON(response, 404, { error: 'Todo not found' });
		return;
	}

	const id = Number(idText);
	const index = todos.findIndex((todo) => todo.id === id);
	const existing = todos[index];
	if (existing === undefined) {
		sendJSON(response, 404, { error: 'Todo not found' });
		return;
	}

	if (request.method === 'GET') {
		sendJSON(response, 200, existing);
		return;
	}
	if (request.method === 'PUT') {
		const todo = normalizedTodo(await readJSON(request), id);
		todos[index] = todo;
		sendJSON(response, 200, todo);
		return;
	}
	if (request.method === 'DELETE') {
		todos.splice(index, 1);
		response.writeHead(204, { 'cache-control': 'no-store' });
		response.end();
		return;
	}

	response.setHeader('allow', 'GET, PUT, DELETE');
	sendJSON(response, 405, { error: 'Method not allowed' });
}

function resolveStaticPath(pathname: string): ResolvedStaticPath | null {
	const decodedPath = decodeURIComponent(pathname);
	if (decodedPath.includes('\0')) throw new TypeError('Invalid path');
	const publicPath = decodedPath === '/' ? '/index.html' : decodedPath;
	const path = resolve(distDirectory, `.${publicPath}`);
	const pathFromDist = relative(distDirectory, path);
	if (pathFromDist.startsWith('..') || isAbsolute(pathFromDist)) return null;
	return { canFallback: extname(publicPath) === '', path };
}

function errorCode(error: unknown): string | undefined {
	if (error === null || typeof error !== 'object' || !('code' in error)) return undefined;
	return typeof error.code === 'string' ? error.code : undefined;
}

async function readStaticFile(path: string): Promise<Buffer | null> {
	try {
		const metadata = await stat(path);
		if (!metadata.isFile()) return null;
		return await readFile(path);
	} catch (error) {
		if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return null;
		throw error;
	}
}

async function serveStatic(
	request: IncomingMessage,
	response: ServerResponse,
	pathname: string,
): Promise<void> {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.setHeader('allow', 'GET, HEAD');
		sendJSON(response, 405, { error: 'Method not allowed' });
		return;
	}
	const resolvedPath = resolveStaticPath(pathname);
	if (!resolvedPath) {
		sendJSON(response, 404, { error: 'Not found' });
		return;
	}

	let filePath = resolvedPath.path;
	let body = await readStaticFile(filePath);
	if (!body && resolvedPath.canFallback) {
		filePath = indexPath;
		body = await readStaticFile(filePath);
	}
	if (!body) {
		sendJSON(response, 404, { error: 'Not found' });
		return;
	}

	response.writeHead(200, {
		'cache-control': 'no-store',
		'content-length': body.length,
		'content-type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
		'x-content-type-options': 'nosniff',
	});
	response.end(request.method === 'HEAD' ? undefined : body);
}

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? '/', 'http://localhost');
		if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
			await handleAPI(request, response, url.pathname);
		} else {
			await serveStatic(request, response, url.pathname);
		}
	} catch (error) {
		const status =
			error instanceof RangeError
				? 413
				: error instanceof SyntaxError || error instanceof TypeError
					? 400
					: 500;
		sendJSON(response, status, {
			error: status === 500 ? 'Internal server error' : (error as Error).message,
		});
	}
});

const configuredPort = Number.parseInt(process.env.PORT ?? '4173', 10);
const port =
	Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
		? configuredPort
		: 4173;
server.listen(port, '127.0.0.1', () => {
	console.log(`Todo example: http://127.0.0.1:${port}`);
});
