import { Collection, Model } from '@charliewilco/modern-backbone';

export interface LocationAttributes {
	id?: number;
	name: string;
	region?: string;
	country: string;
	latitude: number;
	longitude: number;
}

export interface WeatherAttributes {
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

export class Location extends Model<LocationAttributes> {
	get label(): string {
		const name = this.get('name') ?? 'Unknown place';
		const region = this.get('region');
		const country = this.get('country');
		return [name, region, country].filter(Boolean).join(', ');
	}
}

export class Locations extends Collection<Location> {
	static override model = Location;
}

export class Weather extends Model<WeatherAttributes> {}
