import { Router } from '@charliewilco/modern-backbone';

import { requiredElement } from './dom.js';
import { Game } from './game.js';
import { GameView } from './views.js';

const game = new Game();
const router = new Router();
const app = new GameView({
	el: requiredElement(document, '#app', HTMLElement),
	game,
	router,
});

router
	.route('/', () => app.reset('X'))
	.route('/play/:starter', ({ starter }) => app.reset(starter === 'O' ? 'O' : 'X'))
	.start();
