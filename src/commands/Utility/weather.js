import { SlashCommandBuilder } from 'discord.js';
import { NO_PINGS, container, divider, text, v2Flags } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { BOT_USER_AGENT } from '../../config/bot.js';
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Get real-time weather information for a location")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("The city name, e.g., 'London' or 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Weather interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            { headers: { 'User-Agent': BOT_USER_AGENT } },
        );
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Weather command - city not found`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Could not find a location for **${city}**. Please check the spelling.` });
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`,
            { headers: { 'User-Agent': BOT_USER_AGENT } },
        );
        const weatherData = await weatherResponse.json();

        if (weatherData.error) {
            logger.error(`Weather API error`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'A weather service error occurred.' });
            return;
        }

        // NOTE: the legacy `current_weather=true` endpoint returns no humidity
        // field at all — humidity needs the `current=` selector below.
        const current = weatherData.current || {};
        const temperature = current.temperature_2m ?? current.temperature;
        const humidity = current.relative_humidity_2m ?? current.relativehumidity;
        const windSpeed = current.wind_speed_10m ?? current.windspeed;
        const weatherCode = current.weather_code ?? current.weathercode ?? null;

        const displayTemp = temperature != null ? Math.round(temperature) : 'N/A';
        const displayHumidity = humidity ?? 'N/A';
        const displayWind = windSpeed != null ? Math.round(windSpeed) : 'N/A';

        const condition = getWeatherDescription(weatherCode);

        const weatherContainer = container({
            parts: [
                text(`### Weather in ${cityDisplay}, ${country}`),
                text(condition.description),
                text(`**Temperature:** ${displayTemp}°C\n**Humidity:** ${displayHumidity}%\n**Wind Speed:** ${displayWind} km/h`),
                divider(),
                text(`-# Latitude: ${latitude.toFixed(2)} | Longitude: ${longitude.toFixed(2)}`),
            ],
        });

        await InteractionHelper.safeEditReply(interaction, { components: [weatherContainer], flags: v2Flags(), allowedMentions: NO_PINGS });
        logger.info(`Weather command executed`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: displayTemp,
            guildId: interaction.guildId
        });
    },
};

function getWeatherDescription(code) {
    if (code === null || code === undefined) {
        return { description: "Unknown conditions.", emoji: "" };
    }
    if (code >= 0 && code <= 3) {
        return { description: "Clear sky / Partly cloudy", emoji: "" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Fog and Rime fog", emoji: "" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Drizzle or Rain", emoji: "" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Snow fall", emoji: "" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Showers (Rain/Snow)", emoji: "" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Thunderstorm", emoji: "" };
    }
    return { description: "Unknown conditions.", emoji: "" };
}