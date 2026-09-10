import { Router } from '@charliewilco/modern-backbone';
import { requiredElement } from './dom.js';
import { NewsAppView } from './news-app-view.js';
import { Stories } from './stories.js';

const stories = new Stories();
const router = new Router();
const app = new NewsAppView({
	collection: stories,
	el: requiredElement(document, '#app', HTMLElement),
	router,
});

router
	.route('/', () => void app.showFeed('top'))
	.route('/new', () => void app.showFeed('new'))
	.route('/story/:id', ({ id }) => void app.showStory(id))
	.start();
