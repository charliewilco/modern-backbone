import { Router } from '@charliewilco/modern-backbone';
import { requiredElement } from './dom.js';
import { Locations } from './models.js';
import { WeatherAppView } from './weather-app-view.js';

const locations = new Locations();
const router = new Router();
const app = new WeatherAppView({
	collection: locations,
	el: requiredElement(document, '#app', HTMLElement),
	router,
});

router
	.route('/', () => app.showResults())
	.route('/weather/:id', ({ id }) => void app.showWeather(id))
	.start();
