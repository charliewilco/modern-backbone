import {
	Collection,
	type CollectionUpdateDetail,
	Model,
	Router,
	View,
	type ViewDestroyOptions,
} from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';

type ElementConstructor<T extends HTMLElement> = new () => T;

interface LocationAttributes {
	id?: number;
	name: string;
	region?: string;
	country: string;
	latitude: number;
	longitude: number;
}

interface WeatherAttributes {
	id?: number;
	locationName: string;
	time: string;
	temperature: number;
	temperatureUnit: string;
	apparentTemperature: number;
	humidity: number;
	humidityUnit: string;
	weatherCode: number;
	windSpeed: number;
	windSpeedUnit: string;
}

function requiredElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
	ElementType: ElementConstructor<T>,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof ElementType)) throw new Error(`Missing ${selector}`);
	return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class Location extends Model<LocationAttributes> {
	get label(): string {
		const name = this.get('name') ?? 'Unknown place';
		const region = this.get('region');
		const country = this.get('country');
		return [name, region, country].filter(Boolean).join(', ');
	}
}

class Locations extends Collection<Location> {
	static override model = Location;
}

class Weather extends Model<WeatherAttributes> {
	async load(location: Location, signal: AbortSignal): Promise<this> {
		const latitude = location.get('latitude');
		const longitude = location.get('longitude');
		if (latitude === undefined || longitude === undefined || location.id === undefined) {
			throw new TypeError('The selected location is incomplete');
		}

		const url = new URL('https://api.open-meteo.com/v1/forecast');
		url.searchParams.set('latitude', String(latitude));
		url.searchParams.set('longitude', String(longitude));
		url.searchParams.set(
			'current',
			[
				'temperature_2m',
				'apparent_temperature',
				'relative_humidity_2m',
				'weather_code',
				'wind_speed_10m',
			].join(','),
		);
		url.searchParams.set('forecast_days', '1');
		url.searchParams.set('timezone', 'auto');

		const response = await fetch(url, { signal });
		if (!response.ok) throw new Error(`Could not load weather (${response.status})`);
		const body: unknown = await response.json();
		this.set(parseWeather(body, location));
		return this;
	}
}

function parseLocation(value: unknown): LocationAttributes {
	if (!isRecord(value)) throw new TypeError('Expected a location object');
	if (
		typeof value.id !== 'number' ||
		typeof value.name !== 'string' ||
		typeof value.country !== 'string' ||
		typeof value.latitude !== 'number' ||
		typeof value.longitude !== 'number'
	) {
		throw new TypeError('Location data is incomplete');
	}
	const location: LocationAttributes = {
		country: value.country,
		id: value.id,
		latitude: value.latitude,
		longitude: value.longitude,
		name: value.name,
	};
	if (typeof value.admin1 === 'string') location.region = value.admin1;
	return location;
}

function parseWeather(value: unknown, location: Location): WeatherAttributes {
	if (!isRecord(value) || !isRecord(value.current) || !isRecord(value.current_units)) {
		throw new TypeError('Expected current weather data');
	}
	const { current, current_units: units } = value;
	if (
		typeof current.time !== 'string' ||
		typeof current.temperature_2m !== 'number' ||
		typeof current.apparent_temperature !== 'number' ||
		typeof current.relative_humidity_2m !== 'number' ||
		typeof current.weather_code !== 'number' ||
		typeof current.wind_speed_10m !== 'number' ||
		typeof units.temperature_2m !== 'string' ||
		typeof units.relative_humidity_2m !== 'string' ||
		typeof units.wind_speed_10m !== 'string' ||
		location.id === undefined
	) {
		throw new TypeError('Current weather data is incomplete');
	}
	return {
		apparentTemperature: current.apparent_temperature,
		humidity: current.relative_humidity_2m,
		humidityUnit: units.relative_humidity_2m,
		id: location.id,
		locationName: location.label,
		temperature: current.temperature_2m,
		temperatureUnit: units.temperature_2m,
		time: current.time,
		weatherCode: current.weather_code,
		windSpeed: current.wind_speed_10m,
		windSpeedUnit: units.wind_speed_10m,
	};
}

async function searchLocations(query: string, signal: AbortSignal): Promise<LocationAttributes[]> {
	const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
	url.searchParams.set('name', query);
	url.searchParams.set('count', '5');
	url.searchParams.set('language', 'en');
	url.searchParams.set('format', 'json');

	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`Could not search places (${response.status})`);
	const body: unknown = await response.json();
	if (!isRecord(body)) throw new TypeError('Expected a geocoding response');
	if (body.results === undefined) return [];
	if (!Array.isArray(body.results)) throw new TypeError('Expected a location list');
	return body.results.map(parseLocation);
}

function weatherDescription(code: number): string {
	if (code === 0) return 'Clear sky';
	if (code <= 2) return 'Partly cloudy';
	if (code === 3) return 'Overcast';
	if (code === 45 || code === 48) return 'Fog';
	if (code >= 51 && code <= 67) return 'Rain';
	if (code >= 71 && code <= 77) return 'Snow';
	if (code >= 80 && code <= 82) return 'Rain showers';
	if (code >= 85 && code <= 86) return 'Snow showers';
	if (code >= 95) return 'Thunderstorm';
	return 'Current conditions';
}

class LocationResultsView extends View<Model, Locations> {
	#empty: HTMLParagraphElement;
	#list: HTMLUListElement;
	#locations: Locations;

	constructor({ collection, el }: { collection: Locations; el: HTMLElement }) {
		super({ collection, el });
		this.#locations = collection;
		this.#list = requiredElement(this.el, '#place-list', HTMLUListElement);
		this.#empty = requiredElement(this.el, '#empty-results', HTMLParagraphElement);
		this.listen<CustomEvent<CollectionUpdateDetail<Location>>>(this.#locations, 'update', () =>
			this.render(),
		);
	}

	override render(): this {
		const items = [...this.#locations].map((location) => {
			if (location.id === undefined) return null;
			const region = [location.get('region'), location.get('country')].filter(Boolean).join(', ');
			return hbs`
				<li>
					<a href=${`/weather/${location.id}`} data-location-id=${location.id}>
						<span class="place-name">${location.get('name') ?? 'Unknown place'}</span>
						<span class="place-region">${region}</span>
					</a>
				</li>
			`;
		});
		this.#list.replaceChildren(hbs`${items}`);
		this.#empty.hidden = this.#locations.length > 0;
		return this;
	}
}

class ForecastView extends View<Weather> {
	#weather: Weather;

	constructor({ model, el }: { model: Weather; el: HTMLElement }) {
		super({ model, el });
		this.#weather = model;
		this.listen(this.#weather, 'change', () => this.render());
		this.render();
	}

	override render(): this {
		const temperature = this.#weather.get('temperature');
		const temperatureUnit = this.#weather.get('temperatureUnit') ?? '';
		const apparent = this.#weather.get('apparentTemperature');
		const humidity = this.#weather.get('humidity');
		const humidityUnit = this.#weather.get('humidityUnit') ?? '';
		const wind = this.#weather.get('windSpeed');
		const windUnit = this.#weather.get('windSpeedUnit') ?? '';
		const code = this.#weather.get('weatherCode');

		const time = this.#weather.get('time');
		this.el.replaceChildren(hbs`
			<a href="/" data-route="results">← Search results</a>
			<div class="forecast-header">
				<div>
					<p id="forecast-location" class="place-context">
						${this.#weather.get('locationName') ?? ''}
					</p>
					<h2 id="forecast-heading">Current weather</h2>
				</div>
				<p id="temperature" class="temperature">
					${temperature === undefined ? '—' : `${temperature}${temperatureUnit}`}
				</p>
			</div>
			<p id="conditions" class="conditions">
				${code === undefined ? '' : weatherDescription(code)}
			</p>
			<dl class="metrics">
				<div>
					<dt>Feels like</dt>
					<dd id="apparent-temperature">
						${apparent === undefined ? '—' : `${apparent}${temperatureUnit}`}
					</dd>
				</div>
				<div>
					<dt>Humidity</dt>
					<dd id="humidity">${humidity === undefined ? '—' : `${humidity}${humidityUnit}`}</dd>
				</div>
				<div>
					<dt>Wind</dt>
					<dd id="wind">${wind === undefined ? '—' : `${wind} ${windUnit}`}</dd>
				</div>
			</dl>
			<p id="observed-at" class="observed-at">
				${time ? `Observed ${time.replace('T', ' ')}` : ''}
			</p>
		`);
		return this;
	}
}

class WeatherAppView extends View<Model, Locations> {
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
			await this.#weather.load(location, request.signal);
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
