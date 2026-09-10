import { Router } from '@charliewilco/modern-backbone';
import { requiredElement } from './dom.js';
import { TodoAppView } from './todo-app-view.js';
import { loadTodos, Todos, type TodoAttributes } from './todos.js';

let records: TodoAttributes[] = [];
let loadError: unknown;
try {
	records = await loadTodos();
} catch (error) {
	loadError = error;
}

const collection = new Todos(records);
const router = new Router();
const app = new TodoAppView({
	collection,
	el: requiredElement(document, '#app', HTMLElement),
	router,
});

router
	.route('/', () => app.setFilter('all'))
	.route('/active', () => app.setFilter('active'))
	.route('/completed', () => app.setFilter('completed'))
	.start();

if (loadError !== undefined) app.showError(loadError);
