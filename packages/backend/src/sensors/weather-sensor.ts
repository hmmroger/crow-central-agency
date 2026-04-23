import { z } from "zod";
import type { ClientLocation } from "../server/request-context.types.js";
import type { Sensor, SensorContext } from "./sensor-manager.types.js";
import { logger } from "../utils/logger.js";

export const WEATHER_SENSOR_ID = "weather";

const log = logger.child({ context: "weather-sensor" });

const OPEN_METEO_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=7";

/** WMO weather interpretation codes mapped to human-readable descriptions */
const WMO_WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

type DailyForecast = {
  date: string;
  weatherDescription: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;
  windSpeedMax: number;
};

type ForecastData = {
  timezone: string;
  daily: DailyForecast[];
};

const OpenMeteoDailySchema = z.object({
  time: z.array(z.string()),
  weather_code: z.array(z.number()),
  temperature_2m_max: z.array(z.number()),
  temperature_2m_min: z.array(z.number()),
  precipitation_sum: z.array(z.number()),
  wind_speed_10m_max: z.array(z.number()),
});

const OpenMeteoForecastSchema = z.object({
  timezone: z.string(),
  daily: OpenMeteoDailySchema,
});

/** Cache TTL — re-fetch forecast after 1 hour */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Timeout for Open-Meteo API requests */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Weather sensor that fetches a 7-day forecast from Open-Meteo.
 * Caches results with a TTL to avoid redundant API calls.
 * Returns cached data regardless of location changes until TTL expires.
 * Concurrent callers share a single in-flight fetch to prevent thundering herd.
 */
export class WeatherSensor implements Sensor {
  public readonly id: string = WEATHER_SENSOR_ID;
  public readonly name: string = "Weather";
  private cachedForecast: ForecastData | undefined;
  private cachedAt: number | undefined;
  private inflightFetch: Promise<ForecastData> | undefined;

  constructor() {}

  public async getReading(sensorContext: SensorContext): Promise<string> {
    const clientLocation = sensorContext.location;
    if (!clientLocation) {
      return this.cachedForecast ? this.formatForecast(this.cachedForecast) : "";
    }

    const isCacheExpired = this.cachedAt === undefined || Date.now() - this.cachedAt > CACHE_TTL_MS;
    if (isCacheExpired && !this.inflightFetch) {
      this.inflightFetch = this.fetchForecast(clientLocation)
        .then((forecast) => {
          this.cachedForecast = forecast;
          this.cachedAt = Date.now();
          return forecast;
        })
        .catch((error) => {
          log.warn({ error }, "Failed to fetch weather forecast");
          if (this.cachedForecast) {
            return this.cachedForecast;
          }

          throw error;
        })
        .finally(() => {
          this.inflightFetch = undefined;
        });
    }

    if (this.inflightFetch) {
      try {
        await this.inflightFetch;
      } catch {
        // Error already logged; fall through to cached data below
      }
    }

    return this.cachedForecast ? this.formatForecast(this.cachedForecast) : "";
  }

  /** Fetch 7-day forecast from Open-Meteo and parse into ForecastData */
  private async fetchForecast(location: ClientLocation): Promise<ForecastData> {
    const url = OPEN_METEO_FORECAST_URL.replace("{lat}", String(location.latitude)).replace(
      "{lon}",
      String(location.longitude)
    );

    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Open-Meteo forecast failed: HTTP ${response.status}`);
    }

    const json = await response.json();
    const parsed = OpenMeteoForecastSchema.parse(json);

    const daily: DailyForecast[] = parsed.daily.time.map((date, index) => ({
      date,
      weatherDescription: WMO_WEATHER_CODES[parsed.daily.weather_code[index]] ?? "Unknown",
      temperatureMax: parsed.daily.temperature_2m_max[index],
      temperatureMin: parsed.daily.temperature_2m_min[index],
      precipitationSum: parsed.daily.precipitation_sum[index],
      windSpeedMax: parsed.daily.wind_speed_10m_max[index],
    }));

    return { timezone: parsed.timezone, daily };
  }

  /** Format forecast data into a readable string for agent system prompts */
  private formatForecast(forecast: ForecastData): string {
    const lines = [`7-Day Weather Forecast (timezone: ${forecast.timezone}):`];

    for (const day of forecast.daily) {
      lines.push(
        `  ${day.date}: ${day.weatherDescription}, ${day.temperatureMin}°C–${day.temperatureMax}°C, precipitation ${day.precipitationSum}mm, wind ${day.windSpeedMax}km/h`
      );
    }

    return lines.join("\n");
  }
}
