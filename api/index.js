import ical from 'node-ical';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(tz);

const TZ = 'Europe/Oslo';
const {
  ICS_URL,
  LAT = '58.9997',
  LON = '5.6187',
  CONTACT_EMAIL = 'tomas@rosbak.com'
} = process.env;

/* Hent dagens hendelser */
async function getTodayEvents() {
  const feed = await ical.async.fromURL(ICS_URL);
  return Object.values(feed)
    .filter(e => e.type === 'VEVENT')
    .filter(e => dayjs(e.start).tz(TZ).isSame(dayjs().tz(TZ), 'day'))
    .sort((a, b) => a.start - b.start)
    .map(e => ({
      time: dayjs(e.start).tz(TZ).format('HH:mm'),
      summary: e.summary || 'Opptatt'
    }));
}

/* Hent vær nå fra Yr / MET Norway */
async function getWeatherNow() {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `TRMNL-plugin/1.0 ${CONTACT_EMAIL}` }
  });
  if (!res.ok) throw new Error(`MET Norway svarte ${res.status}`);
  const json = await res.json();
  const now = json.properties.timeseries[0];

  const { air_temperature: temp } = now.data.instant.details;
  const precip =
    now.data.next_1_hours?.details?.precipitation_amount?.toFixed(1) ?? '0';
  const symbol = now.data.next_1_hours?.summary?.symbol_code ?? '';

  return { temp, precip, symbol };
}

/* HTML-generering */
function renderHTML({ events, weather }) {
  return `<!DOCTYPE html><html lang="no"><head>
<meta charset="utf-8"><link rel="stylesheet" href="https://usetrmnl.com/css/latest/plugins.css">
<style>body{margin:0;font-family:var(--font)}.grid{display:flex;height:100vh}.col{flex:1;padding:1.6rem}.title{font-size:1.2rem;font-weight:700}
ul{margin:0;padding:0;list-style:none}li{margin:.25rem 0}.weather-now{font-size:2.5rem;font-weight:700}.label{font-size:.9rem;opacity:.7}
</style><title>Dagens agenda + vær</title></head><body>
<div class="grid">
  <div class="col">
    <div class="title">I DAG</div>
    <ul>
      ${
        events.length
          ? events.map(e => `<li><strong>${e.time}</strong> ${e.summary}</li>`).join('')
          : '<li>Ingen hendelser</li>'
      }
    </ul>
  </div>
  <div class="col" style="text-align:center">
    <div class="title">Vær nå</div>
    <div class="weather-now">${weather.temp.toFixed(1)}°C</div>
    <div class="label">Nedbør neste time: ${weather.precip} mm</div>
    <div class="label">${weather.symbol.replace('_',' ')}</div>
  </div>
</div>
</body></html>`;
}

/* ------------  Vercel Serverless handler  --------------- */
export default async function handler(req, res) {
  try {
    const [events, weather] = await Promise.all([
      getTodayEvents(),
      getWeatherNow()
    ]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderHTML({ events, weather }));
  } catch (err) {
    console.error(err);
    res.status(500).send(`Feil: ${err.message}`);
  }
}
