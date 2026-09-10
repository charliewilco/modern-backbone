import type { Location, LocationAttributes, WeatherAttributes } from './models.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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

export async function searchLocations(
	query: string,
	signal: AbortSignal,
): Promise<LocationAttributes[]> {
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

export async function loadWeather(
	location: Location,
	signal: AbortSignal,
): Promise<WeatherAttributes> {
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
	return parseWeather(await response.json(), location);
}
