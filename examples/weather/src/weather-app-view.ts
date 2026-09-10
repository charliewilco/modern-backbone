import {
	type Model,
	type Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { loadWeather, searchLocations } from './api.js';
import { requiredElement } from './dom.js';
import { type Locations, Weather } from './models.js';
import { ForecastView, LocationResultsView } from './weather-views.js';

export class WeatherAppView extends View<Model, Locations> {
	#forecastRequest: AbortController | undefined;
	#forecastView: ForecastView;
	#form: HTMLFormElement;
	#input: HTMLInputElement;
	#locations: Locations;
	#resultsView: LocationResultsView;
	#router: Router;
	#searchRequest: AbortController | undefined;
	#status: HTMLParagraphElement;
	#submit: HTMLButtonElement;
	#weather: Weather;

	constructor({
		collection,
		el,
		router,
	}: { collection: Locations; el: HTMLElement; router: Router }) {
		super({ collection, el });
		this.#locations = collection;
		this.#router = router;
		this.#weather = new Weather();
		this.#form = requiredElement(this.el, '#place-search', HTMLFormElement);
		this.#input = requiredElement(this.el, '#place-name', HTMLInputElement);
		this.#submit = requiredElement(this.#form, 'button', HTMLButtonElement);
		this.#status = requiredElement(this.el, '#status', HTMLParagraphElement);
		this.#resultsView = new LocationResultsView({
			collection,
			el: requiredElement(this.el, '#results', HTMLElement),
		});
		this.#forecastView = new ForecastView({
			el: requiredElement(this.el, '#forecast', HTMLElement),
			model: this.#weather,
		});

		this.listen(this.#form, 'submit', (event) => {
			event.preventDefault();
			void this.#search();
		});
		this.listen(this.el, 'click', (event) => this.#navigate(event));
	}

	showResults(): this {
		this.#forecastRequest?.abort();
		this.#resultsView.el.hidden = false;
		this.#forecastView.el.hidden = true;
		return this;
	}

	async showWeather(id: string): Promise<void> {
		const numericId = Number(id);
		const location = Number.isFinite(numericId) ? this.#locations.get(numericId) : undefined;
		if (!location) {
			this.#showError('Search for a place before opening its weather.');
			this.showResults();
			return;
		}

		this.#forecastRequest?.abort();
		const request = new AbortController();
		this.#forecastRequest = request;
		this.#resultsView.el.hidden = true;
		this.#forecastView.el.hidden = false;
		this.#setStatus(`Loading weather for ${location.label}…`);

		try {
			this.#weather.set(await loadWeather(location, request.signal));
			if (this.#forecastRequest === request) this.#setStatus('');
		} catch (error) {
			if (request.signal.aborted) return;
			this.#showError(error instanceof Error ? error.message : 'Could not load weather.');
		}
	}

	override destroy(options: ViewDestroyOptions = {}): this {
		this.#searchRequest?.abort();
		this.#forecastRequest?.abort();
		this.#resultsView.destroy({ remove: false });
		this.#forecastView.destroy({ remove: false });
		return super.destroy(options);
	}

	async #search(): Promise<void> {
		const query = this.#input.value.trim();
		if (!query) return;

		this.#searchRequest?.abort();
		const request = new AbortController();
		this.#searchRequest = request;
		this.#setBusy(true);
		this.#setStatus(`Searching for ${query}…`);

		try {
			const records = await searchLocations(query, request.signal);
			if (this.#searchRequest !== request) return;
			for (const location of [...this.#locations]) this.#locations.remove(location);
			for (const record of records) this.#locations.add(record);
			this.#setStatus(
				records.length === 0
					? `No places found for ${query}.`
					: `${records.length} ${records.length === 1 ? 'place' : 'places'} found.`,
			);
			if (location.pathname === '/') this.showResults();
			else this.#router.navigate('/');
		} catch (error) {
			if (request.signal.aborted) return;
			this.#showError(error instanceof Error ? error.message : 'Could not search places.');
		} finally {
			if (this.#searchRequest === request) this.#setBusy(false);
		}
	}

	#navigate(event: Event): void {
		if (!(event instanceof MouseEvent) || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a[data-location-id], a[data-route]');
		if (!(link instanceof HTMLAnchorElement) || !this.el.contains(link)) return;
		const destination = new URL(link.href);
		if (destination.origin !== location.origin) return;
		event.preventDefault();
		this.#router.navigate(destination.pathname);
	}

	#setBusy(busy: boolean): void {
		this.#input.disabled = busy;
		this.#submit.disabled = busy;
		this.#form.setAttribute('aria-busy', String(busy));
	}

	#setStatus(message: string): void {
		this.#status.classList.remove('is-error');
		this.#status.textContent = message;
	}

	#showError(message: string): void {
		this.#status.classList.add('is-error');
		this.#status.textContent = message;
	}
}
