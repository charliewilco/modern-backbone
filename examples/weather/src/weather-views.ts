import { type CollectionUpdateDetail, type Model, View } from '@charliewilco/modern-backbone';
import { hbs } from '@charliewilco/modern-handlebars';
import { requiredElement } from './dom.js';
import type { Location, Locations, Weather } from './models.js';

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

export class LocationResultsView extends View<Model, Locations> {
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

export class ForecastView extends View<Weather> {
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
