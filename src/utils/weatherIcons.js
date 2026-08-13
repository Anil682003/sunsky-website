// WeatherAPI condition codes → the small set of shapes this page draws.
//
// The upstream also serves its own PNG icons, but they are raster, hosted on a third-party CDN
// and styled nothing like the rest of the page. Mapping to our own inline SVG keeps the block
// looking native, keeps it working when that CDN is slow, and keeps it crisp on a retina panel.
//
// Codes are from https://www.weatherapi.com/docs/weather_conditions.json. Anything unmapped
// falls back to `cloud`, which is the safest thing to draw when we do not know.

const SUN = 'sun';
const PARTLY = 'partly';
const CLOUD = 'cloud';
const RAIN = 'rain';
const HEAVY_RAIN = 'heavyRain';
const STORM = 'storm';
const SNOW = 'snow';
const FOG = 'fog';

const CODE_MAP = {
  1000: SUN,                                        // Clear / Sunny
  1003: PARTLY,                                     // Partly cloudy
  1006: CLOUD, 1009: CLOUD,                         // Cloudy / Overcast
  1030: FOG, 1135: FOG, 1147: FOG,                  // Mist / Fog / Freezing fog
  1063: RAIN, 1150: RAIN, 1153: RAIN, 1168: RAIN, 1171: RAIN,
  1180: RAIN, 1183: RAIN, 1186: RAIN, 1189: RAIN,
  1240: RAIN,                                       // Light rain shower
  1192: HEAVY_RAIN, 1195: HEAVY_RAIN, 1198: HEAVY_RAIN, 1201: HEAVY_RAIN,
  1243: HEAVY_RAIN, 1246: HEAVY_RAIN,               // Heavy rain / showers
  1087: STORM, 1273: STORM, 1276: STORM, 1279: STORM, 1282: STORM,
  1066: SNOW, 1069: SNOW, 1072: SNOW, 1114: SNOW, 1117: SNOW,
  1204: SNOW, 1207: SNOW, 1210: SNOW, 1213: SNOW, 1216: SNOW, 1219: SNOW,
  1222: SNOW, 1225: SNOW, 1237: SNOW, 1249: SNOW, 1252: SNOW,
  1255: SNOW, 1258: SNOW, 1261: SNOW, 1264: SNOW,
};

/**
 * @param {number} code WeatherAPI condition code
 * @param {boolean} isDay whether it is daytime at the hotel — only clear skies look different
 * @returns {string} an icon key: sun | moon | partly | partlyNight | cloud | rain | heavyRain | storm | snow | fog
 */
export function weatherIcon(code, isDay = true) {
  const key = CODE_MAP[Number(code)] || CLOUD;
  if (isDay) return key;
  if (key === SUN) return 'moon';
  if (key === PARTLY) return 'partlyNight';
  return key;
}

export default weatherIcon;
