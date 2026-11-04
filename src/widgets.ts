import { PROVINCES } from "./settings";
import { thaiDate } from "./time";

// Side panels refreshed by the hourly cron and served from one KV key: PM2.5 for the northern
// provinces and a few market numbers. No AI. About 18 external requests an hour (13 of them
// OpenAQ), a few more when oil, fuel or the OpenAQ sensor list is due.
//
// PM2.5: Pollution Control Department stations (Air4Thai) through OpenAQ v3, one station per
//   province, needs the free OPENAQ_API_KEY secret. Air4Thai's own API fails TLS from Workers (its
//   server sends a Let's Encrypt certificate with a Sectigo chain, seen 2026-11-04). Air4Thai
//   publishes the 24 h moving mean each hour, which is what the Thai bands are defined on.
//   A province without a fresh station reading falls back to Open-Meteo (CAMS model estimates,
//   about 40 km grid; free for non-commercial use with attribution), which read 2 to 4 times lower
//   than the stations on 2026-11-04, so it is labelled as an estimate.
// FX: Frankfurter (ECB reference rates, working days only). BTC: CoinGecko public API (no key).
// Gold: gold-api.com real-time XAU (free, no key, commercial use allowed; history needs a key, so
//   the chart is built from our own daily closes). The Thai baht-weight price is an estimate from
//   spot and the ECB rate, not the Gold Traders Association's announced price.
// Oil: Brent and WTI spot from the US EIA API v2 (public domain data; needs a free key in the
//   EIA_API_KEY secret, without it oil is skipped; about a week behind). Fetched every 6 hours.
//   FRED's CSV of the same series answers HTTP 520 to Workers (2026-11-04), so it is not used.
// Thai pump prices: PTT OR's public oil price web service (SOAP CurrentOilPrice, Bangkok prices,
//   about 3 KB). Fetched every 3 hours; prices change at 05:00 when announced.
// SET index and the association's gold price have no free source that allows this use.

const KEY = "widgets";
const UA = { "user-agent": "SecFinBrief/0.1 (personal news digest)" };

export interface Bilingual {
  th: string;
  en: string;
}

export interface AirReading {
  id: string;
  name: Bilingual;
  source: "station" | "model";
  station?: string; // station name, for station readings
  time: string; // hour of the latest value, Thai local time "YYYY-MM-DDTHH:MM"
  pm25: number | null; // latest hourly value, µg/m³; null for stations, which publish only the 24 h mean
  avg24: number | null; // 24 h mean; Thai bands are defined on it
  trend: number[]; // up to 24 hourly values, oldest first (24 h means for stations)
  hours: string[]; // "HH:00" of each trend value; station series can skip hours
}

export interface Air {
  time: string; // newest reading hour, Thai local time
  readings: AirReading[];
}

export interface Rate {
  code: string; // USD, EUR, JPY (per 100 yen)
  thb: number;
  change: number | null; // vs the previous ECB working day, in baht
  series: number[]; // last 10 working days, oldest first
  date: string;
}

export interface Gold {
  usd: number; // per troy ounce
  thbBaht: number | null; // estimated THB per baht-weight (15.244 g) of 96.5% bar gold
  change: number | null; // vs the previous Thai day's last price, USD
  series: number[]; // last price of each Thai day, oldest first, up to 10
  days: string[];
  updatedAt: string;
}

export interface Oil {
  code: "BRENT" | "WTI";
  usd: number; // per barrel
  change: number | null;
  series: number[]; // last 10 trading days, oldest first
  date: string;
}

export interface Markets {
  fx: Rate[];
  btc: { usd: number; thb: number; change24h: number | null } | null;
  gold: Gold | null;
  oil: Oil[];
  oilAt?: number;
}

export interface FuelPrice {
  id: string;
  name: Bilingual;
  price: number; // THB per litre, Bangkok
  change: number | null; // vs the price before the latest change, null until a change has been seen
}

export interface Fuel {
  effective: string; // local time the current prices took effect, "YYYY-MM-DDTHH:MM"
  prices: FuelPrice[];
}

export interface Widgets {
  updatedAt: number;
  air: Air | null;
  airAt: number | null;
  markets: Markets | null;
  marketsAt: number | null;
  fuel?: Fuel | null;
  fuelAt?: number | null;
}

// Thai PM2.5 bands (Pollution Control Department, 24 h mean, in force since 1 June 2023).
// public/app.js keeps a copy for the panel colours.
export const PM25_BANDS = [
  { max: 15, th: "ดีมาก", en: "Very good" },
  { max: 25, th: "ดี", en: "Good" },
  { max: 37.5, th: "ปานกลาง", en: "Moderate" },
  { max: 75, th: "เริ่มมีผลกระทบต่อสุขภาพ", en: "Starting to affect health" },
  { max: Infinity, th: "มีผลกระทบต่อสุขภาพ", en: "Affects health" },
];

export function pm25Level(value: number): number {
  return PM25_BANDS.findIndex((b) => Math.round(value * 10) / 10 <= b.max);
}

interface OpenMeteoPoint {
  current?: { time?: string; pm2_5?: number | null };
  hourly?: { time?: string[]; pm2_5?: (number | null)[] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function parseAir(raw: unknown): Air {
  const points = (Array.isArray(raw) ? raw : [raw]) as OpenMeteoPoint[];
  if (points.length !== PROVINCES.length) throw new Error(`Open-Meteo returned ${points.length} locations`);
  const readings = PROVINCES.map((p, i) => {
    const { current, hourly } = points[i];
    const values = (hourly?.pm2_5 ?? []).filter((v): v is number => typeof v === "number");
    // The hourly series stops an hour before `current`; add the current hour so the trend ends at
    // `time` and the 24 h mean includes the latest reading.
    const lastHour = hourly?.time?.at(-1) ?? "";
    if (typeof current?.pm2_5 === "number" && current.time && current.time > lastHour) values.push(current.pm2_5);
    const trend = values.slice(-24).map(round1);
    const time = current?.time ?? lastHour;
    return {
      id: p.id,
      name: { th: p.th, en: p.en },
      source: "model" as const,
      time,
      pm25: typeof current?.pm2_5 === "number" ? round1(current.pm2_5) : (trend.at(-1) ?? null),
      avg24: trend.length >= 12 ? round1(trend.reduce((s, v) => s + v, 0) / trend.length) : null,
      trend,
      hours: hoursBack(time, trend.length),
    };
  });
  return { time: points[0].current?.time ?? "", readings };
}

// "HH:00" labels for `n` consecutive hours ending at `time`.
function hoursBack(time: string, n: number): string[] {
  const end = Number(time.slice(11, 13)) || 0;
  return Array.from({ length: n }, (_, i) => `${String((end - (n - 1 - i) + 48) % 24).padStart(2, "0")}:00`);
}

// OpenAQ location ids of the Air4Thai station used for each province (chosen 2026-11-04: the
// provincial capital's station). Tak's only active Air4Thai station is in Mae Sot, which had sent
// nothing since 2026-10-06, so Tak shows the model estimate until it returns.
export const AIR_STATIONS: Record<string, number> = {
  chiangmai: 225579, // 36t Yupparaj Wittayalai School
  chiangrai: 2328, // 57t Natural Resources and Environment Office
  lampang: 225570, // 37t Meteorological station
  lamphun: 225655, // 68t Meteorological station
  maehongson: 225648, // 58t Natural Resources and Environment Office
  phayao: 225666, // 70t Phayao Provincial Hall
  phrae: 225630, // 69t Meteorology Center
  nan: 225674, // 67t Municipality Office
  uttaradit: 228543, // 92t King Bhumibol 72nd Anniversary Park
  tak: 225626, // 76t Non-Formal Education Centre, Mae Sot
  sukhothai: 351927, // 96t Le Thai Community Park
  phitsanulok: 225585, // 86t Chom Nan Chaloem Phrakiat Park
  phetchabun: 270250, // 97t Phetbura garden
};

const OPENAQ = "https://api.openaq.org/v3";
const AIR4THAI_PROVIDER = 118;
const SENSORS_KEY = "openaq:sensors";
const SENSORS_EVERY_MS = 24 * 60 * 60 * 1000;
const STATION_STALE_MS = 3 * 60 * 60 * 1000;

// Each station has had more than one PM2.5 sensor id over time (OpenAQ moved them in May 2026 and
// back), so the candidates come from OpenAQ once a day and the one that last worked is tried first.
interface SensorMap {
  at: number;
  sensors: Record<string, number[]>; // location id -> PM2.5 sensor ids
  names: Record<string, string>; // location id -> station name
  pick: Record<string, number>; // location id -> sensor that last had fresh data
}

export function parseSensorList(raw: { results?: { id: number; name?: string; sensors?: { id: number; parameter?: { id: number } }[] }[] }, now: number): SensorMap {
  const map: SensorMap = { at: now, sensors: {}, names: {}, pick: {} };
  for (const l of raw.results ?? []) {
    const ids = (l.sensors ?? []).filter((s) => s.parameter?.id === 2).map((s) => s.id);
    if (ids.length === 0) continue;
    map.sensors[l.id] = ids;
    map.names[l.id] = l.name ?? "";
  }
  return map;
}

async function loadSensorMap(env: Env, key: string, now: number): Promise<SensorMap> {
  const cached = await env.CACHE.get<SensorMap>(SENSORS_KEY, "json");
  if (cached && now - cached.at < SENSORS_EVERY_MS) return cached;
  const url = new URL(`${OPENAQ}/locations`);
  url.searchParams.set("bbox", "97.3,16.2,101.6,20.6");
  url.searchParams.set("parameters_id", "2");
  url.searchParams.set("providers_id", String(AIR4THAI_PROVIDER));
  url.searchParams.set("monitor", "true");
  url.searchParams.set("limit", "200");
  try {
    const res = await fetch(url, { headers: { ...UA, "X-API-Key": key }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`OpenAQ locations HTTP ${res.status}`);
    const map = parseSensorList(await res.json(), now);
    map.pick = cached?.pick ?? {};
    await env.CACHE.put(SENSORS_KEY, JSON.stringify(map));
    return map;
  } catch (err) {
    if (cached) return cached; // keep using yesterday's list
    throw err;
  }
}

export interface StationReading {
  time: string;
  trend: number[];
  hours: string[];
}

interface OpenAqMeasurement {
  value?: number | null;
  period?: { datetimeTo?: { utc?: string; local?: string } };
}

// The last 24 hours of one sensor, or null when its newest value is older than 3 hours.
// Air4Thai marks missing values as negative numbers.
export function parseMeasurements(raw: { results?: OpenAqMeasurement[] }, now: number): StationReading | null {
  const rows = (raw.results ?? [])
    .filter((r) => typeof r.value === "number" && r.value >= 0 && r.period?.datetimeTo?.utc && r.period.datetimeTo.local)
    .sort((a, b) => a.period!.datetimeTo!.utc!.localeCompare(b.period!.datetimeTo!.utc!));
  const last = rows.at(-1);
  if (!last || now - Date.parse(last.period!.datetimeTo!.utc!) > STATION_STALE_MS) return null;
  const since = Date.parse(last.period!.datetimeTo!.utc!) - 24 * 60 * 60 * 1000;
  const day = rows.filter((r) => Date.parse(r.period!.datetimeTo!.utc!) > since);
  return {
    time: last.period!.datetimeTo!.local!.slice(0, 16),
    trend: day.map((r) => round1(r.value!)),
    hours: day.map((r) => `${r.period!.datetimeTo!.local!.slice(11, 13)}:00`),
  };
}

async function fetchSensor(id: number, key: string, now: number): Promise<StationReading | null> {
  const url = new URL(`${OPENAQ}/sensors/${id}/measurements`);
  url.searchParams.set("datetime_from", new Date(now - 25 * 60 * 60 * 1000).toISOString());
  url.searchParams.set("limit", "30");
  const res = await fetch(url, { headers: { ...UA, "X-API-Key": key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenAQ sensor ${id} HTTP ${res.status}`);
  return parseMeasurements(await res.json(), now);
}

// Station readings by province id; provinces without a fresh reading are left out.
async function fetchStations(env: Env, key: string, now: number): Promise<Record<string, StationReading & { station: string }>> {
  const map = await loadSensorMap(env, key, now);
  const out: Record<string, StationReading & { station: string }> = {};
  let picked = false;
  await Promise.all(Object.entries(AIR_STATIONS).map(async ([province, loc]) => {
    const ids = map.sensors[loc] ?? [];
    const order = [...ids].sort((a, b) => Number(b === map.pick[loc]) - Number(a === map.pick[loc]));
    for (const id of order) {
      try {
        const reading = await fetchSensor(id, key, now);
        if (!reading) continue;
        out[province] = { ...reading, station: map.names[loc] ?? "" };
        if (map.pick[loc] !== id) { map.pick[loc] = id; picked = true; }
        return;
      } catch (err) {
        console.error("air station:", province, err);
      }
    }
  }));
  if (picked) await env.CACHE.put(SENSORS_KEY, JSON.stringify(map));
  return out;
}

// Station reading where there is one, the model estimate otherwise.
export function mergeAir(model: Air | null, stations: Record<string, StationReading & { station: string }>): Air {
  const readings = PROVINCES.map((p): AirReading => {
    const s = stations[p.id];
    if (s) {
      return { id: p.id, name: { th: p.th, en: p.en }, source: "station", station: s.station, time: s.time, pm25: null, avg24: s.trend.at(-1) ?? null, trend: s.trend, hours: s.hours };
    }
    return model?.readings.find((r) => r.id === p.id) ?? { id: p.id, name: { th: p.th, en: p.en }, source: "model", time: "", pm25: null, avg24: null, trend: [], hours: [] };
  });
  const time = readings.map((r) => r.time).filter(Boolean).sort().at(-1) ?? "";
  return { time, readings };
}

export async function fetchAir(env: Env, now: number): Promise<Air> {
  const [model, stations] = await Promise.allSettled([
    fetchModelAir(),
    env.OPENAQ_API_KEY ? fetchStations(env, env.OPENAQ_API_KEY, now) : Promise.resolve({}),
  ]);
  if (model.status === "rejected") console.error("air model:", model.reason);
  if (stations.status === "rejected") console.error("air stations:", stations.reason);
  const found = stations.status === "fulfilled" ? stations.value : {};
  if (model.status === "rejected" && Object.keys(found).length === 0) throw model.reason;
  return mergeAir(model.status === "fulfilled" ? model.value : null, found);
}

async function fetchModelAir(): Promise<Air> {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", PROVINCES.map((p) => p.lat).join(","));
  url.searchParams.set("longitude", PROVINCES.map((p) => p.lon).join(","));
  url.searchParams.set("current", "pm2_5");
  url.searchParams.set("hourly", "pm2_5");
  url.searchParams.set("past_hours", "24");
  url.searchParams.set("forecast_hours", "0");
  url.searchParams.set("timezone", "Asia/Bangkok");
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return parseAir(await res.json());
}

// Frankfurter quotes THB per 1 unit of the base; asking with base THB gets every pair in one request.
const FX = [
  { code: "USD", per: 1 },
  { code: "EUR", per: 1 },
  { code: "JPY", per: 100 },
];

export function parseFx(raw: { rates?: Record<string, Record<string, number>> }): Rate[] {
  const days = Object.keys(raw.rates ?? {}).sort().slice(-10);
  return FX.flatMap(({ code, per }) => {
    const series = days.flatMap((d) => {
      const r = raw.rates![d][code];
      return r ? [Math.round((per / r) * 1000) / 1000] : [];
    });
    if (series.length === 0) return [];
    const thb = series.at(-1)!;
    return [{ code, thb, change: series.length > 1 ? Math.round((thb - series.at(-2)!) * 1000) / 1000 : null, series, date: days.at(-1)! }];
  });
}

// 1 baht-weight = 15.244 g, 1 troy ounce = 31.1035 g, Thai bar gold is 96.5% pure.
const BAHT_PER_OZ_965 = (15.244 / 31.1035) * 0.965;

export function goldBahtThb(usdPerOz: number, usdThb: number | undefined): number | null {
  return usdThb ? Math.round((usdPerOz * usdThb * BAHT_PER_OZ_965) / 10) * 10 : null;
}

// One point per Thai day: the latest price replaces today's point, a new day appends one.
export function mergeGold(prev: Gold | null | undefined, usd: number, usdThb: number | undefined, now: number, updatedAt: string): Gold {
  const today = thaiDate(now);
  const days = [...(prev?.days ?? [])];
  const series = [...(prev?.series ?? [])];
  if (days.at(-1) === today) series[series.length - 1] = usd;
  else {
    days.push(today);
    series.push(usd);
  }
  const keep = days.length - 10;
  if (keep > 0) {
    days.splice(0, keep);
    series.splice(0, keep);
  }
  const price = Math.round(usd * 100) / 100;
  return {
    usd: price,
    thbBaht: goldBahtThb(usd, usdThb),
    change: series.length > 1 ? Math.round((usd - series.at(-2)!) * 100) / 100 : null,
    series: series.map((v) => Math.round(v * 100) / 100),
    days,
    updatedAt,
  };
}

// EIA series ids for daily spot prices, USD per barrel.
const EIA_SERIES = { RBRTE: "BRENT", RWTC: "WTI" } as const;

// EIA v2 rows: { period: "YYYY-MM-DD", series: "RBRTE", value: "123.1" }, newest first as requested.
export function parseEia(raw: unknown): Oil[] {
  const rows = (raw as { response?: { data?: { period?: string; series?: string; value?: unknown }[] } }).response?.data ?? [];
  return (Object.entries(EIA_SERIES) as [keyof typeof EIA_SERIES, Oil["code"]][]).flatMap(([series, code]) => {
    const points = rows
      .filter((r) => r.series === series && r.period && r.value !== null && r.value !== "" && Number.isFinite(Number(r.value)))
      .map((r) => ({ date: r.period!, v: Number(r.value) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);
    if (points.length === 0) return [];
    const last = points.at(-1)!;
    return [{ code, usd: last.v, change: points.length > 1 ? Math.round((last.v - points.at(-2)!.v) * 100) / 100 : null, series: points.map((p) => p.v), date: last.date }];
  });
}

const getJson = (url: string, name: string) =>
  fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${name} HTTP ${r.status}`))));

const OIL_EVERY_MS = 6 * 60 * 60 * 1000;

function eiaUrl(key: string): string {
  const u = new URL("https://api.eia.gov/v2/petroleum/pri/spt/data/");
  u.searchParams.set("api_key", key);
  u.searchParams.set("frequency", "daily");
  u.searchParams.append("data[0]", "value");
  for (const s of Object.keys(EIA_SERIES)) u.searchParams.append("facets[series][]", s);
  u.searchParams.set("sort[0][column]", "period");
  u.searchParams.set("sort[0][direction]", "desc");
  u.searchParams.set("length", "30");
  return u.toString();
}

// Each source falls back to its previous value on its own, so one outage does not blank the panel.
export async function fetchMarkets(now: number, prev?: Markets | null, eiaKey?: string): Promise<Markets> {
  const from = new Date(now - 16 * 86_400_000).toISOString().slice(0, 10);
  const oilDue = Boolean(eiaKey) && (!prev?.oil?.length || !prev.oilAt || now - prev.oilAt >= OIL_EVERY_MS);
  const [fx, btc, gold, oil] = await Promise.allSettled([
    getJson(`https://api.frankfurter.dev/v1/${from}..?base=THB&symbols=${FX.map((f) => f.code).join(",")}`, "Frankfurter").then((j) => parseFx(j as never)),
    getJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,thb&include_24hr_change=true", "CoinGecko").then((j) => {
      const b = (j as { bitcoin?: { usd?: number; thb?: number; usd_24h_change?: number } }).bitcoin;
      if (!b?.usd || !b.thb) throw new Error("CoinGecko: no price");
      return { usd: b.usd, thb: b.thb, change24h: typeof b.usd_24h_change === "number" ? Math.round(b.usd_24h_change * 100) / 100 : null };
    }),
    getJson("https://api.gold-api.com/price/XAU", "gold-api").then((j) => {
      const g = j as { price?: number; updatedAt?: string };
      if (typeof g.price !== "number" || g.price <= 0) throw new Error("gold-api: no price");
      return g as { price: number; updatedAt?: string };
    }),
    oilDue ? getJson(eiaUrl(eiaKey!), "EIA").then(parseEia) : Promise.reject(new Error("not due")),
  ]);
  for (const [name, r] of [["fx", fx], ["btc", btc], ["gold", gold], ["oil", oil]] as const) {
    if (r.status === "rejected" && !(name === "oil" && !oilDue)) console.error(`${name}:`, r.reason);
  }
  const rates = fx.status === "fulfilled" && fx.value.length ? fx.value : (prev?.fx ?? []);
  const usdThb = rates.find((r) => r.code === "USD")?.thb;
  const oilFresh = oil.status === "fulfilled" && oil.value.length > 0;
  return {
    fx: rates,
    btc: btc.status === "fulfilled" ? btc.value : (prev?.btc ?? null),
    gold: gold.status === "fulfilled" ? mergeGold(prev?.gold, gold.value.price, usdThb, now, gold.value.updatedAt ?? new Date(now).toISOString()) : (prev?.gold ?? null),
    oil: oilFresh ? oil.value : (prev?.oil ?? []),
    oilAt: oilFresh ? now : prev?.oilAt,
  };
}

// PTT OR product names (English response) to the rows shown, in display order. Premium grades are left out.
const FUELS: { product: string; id: string; name: Bilingual }[] = [
  { product: "Gasohol 95", id: "g95", name: { th: "แก๊สโซฮอล์ 95", en: "Gasohol 95" } },
  { product: "Gasohol 91", id: "g91", name: { th: "แก๊สโซฮอล์ 91", en: "Gasohol 91" } },
  { product: "Gasohol E20", id: "e20", name: { th: "แก๊สโซฮอล์ E20", en: "Gasohol E20" } },
  { product: "Gasoline 95", id: "b95", name: { th: "เบนซิน 95", en: "Benzine 95" } },
  { product: "Diesel", id: "diesel", name: { th: "ดีเซล", en: "Diesel" } },
  { product: "Diesel B20", id: "b20", name: { th: "ดีเซล B20", en: "Diesel B20" } },
];

// The SOAP result is an escaped XML document of <FUEL><PRICE_DATE/><PRODUCT/><PRICE/></FUEL> blocks.
export function parsePtt(soap: string): Fuel | null {
  const xml = decodeXml(soap);
  const found = new Map<string, { price: number; date: string }>();
  for (const [, block] of xml.matchAll(/<FUEL>([\s\S]*?)<\/FUEL>/g)) {
    const product = block.match(/<PRODUCT>([^<]*)<\/PRODUCT>/)?.[1]?.trim();
    const price = Number(block.match(/<PRICE>([^<]*)<\/PRICE>/)?.[1]);
    const date = block.match(/<PRICE_DATE>([^<]*)<\/PRICE_DATE>/)?.[1]?.trim() ?? "";
    if (product && Number.isFinite(price) && price > 0) found.set(product, { price, date });
  }
  const prices = FUELS.flatMap((f) => {
    const p = found.get(f.product);
    return p ? [{ id: f.id, name: f.name, price: p.price, change: null }] : [];
  });
  if (prices.length === 0) return null;
  const effective = [...found.values()].map((p) => p.date).sort().at(-1)!.slice(0, 16);
  return { effective, prices };
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

// When the effective date moves on, each change is measured against the previous prices; until
// then the last known change is kept.
export function mergeFuel(prev: Fuel | null | undefined, next: Fuel): Fuel {
  if (!prev) return next;
  const before = new Map(prev.prices.map((p) => [p.id, p]));
  const moved = next.effective !== prev.effective;
  return {
    effective: next.effective,
    prices: next.prices.map((p) => {
      const old = before.get(p.id);
      if (!old) return p;
      return { ...p, change: moved ? Math.round((p.price - old.price) * 100) / 100 : old.change };
    }),
  };
}

const FUEL_EVERY_MS = 3 * 60 * 60 * 1000;
const PTT_SOAP = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CurrentOilPrice xmlns="http://www.pttor.com"><Language>en</Language></CurrentOilPrice></soap:Body></soap:Envelope>`;

export async function fetchFuel(): Promise<Fuel> {
  const res = await fetch("https://orapiweb.pttor.com/oilservice/OilPrice.asmx", {
    method: "POST",
    headers: { ...UA, "content-type": "text/xml; charset=utf-8", SOAPAction: "http://www.pttor.com/CurrentOilPrice" },
    body: PTT_SOAP,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`PTT OR HTTP ${res.status}`);
  const fuel = parsePtt(await res.text());
  if (!fuel) throw new Error("PTT OR: no prices");
  return fuel;
}

export async function loadWidgets(env: Env): Promise<Widgets | null> {
  return env.CACHE.get<Widgets>(KEY, "json");
}

// A source that fails keeps its previous value (with its own timestamp) instead of blanking the panel.
export async function refreshWidgets(env: Env, now = Date.now()): Promise<Widgets> {
  const prev = await loadWidgets(env);
  const fuelDue = !prev?.fuel || !prev.fuelAt || now - prev.fuelAt >= FUEL_EVERY_MS;
  const [air, markets, fuel] = await Promise.allSettled([
    fetchAir(env, now),
    fetchMarkets(now, prev?.markets, env.EIA_API_KEY),
    fuelDue ? fetchFuel() : Promise.reject(new Error("not due")),
  ]);
  if (air.status === "rejected") console.error("air:", air.reason);
  if (markets.status === "rejected") console.error("markets:", markets.reason);
  if (fuel.status === "rejected" && fuelDue) console.error("fuel:", fuel.reason);
  const next: Widgets = {
    updatedAt: now,
    air: air.status === "fulfilled" ? air.value : (prev?.air ?? null),
    airAt: air.status === "fulfilled" ? now : (prev?.airAt ?? null),
    markets: markets.status === "fulfilled" ? markets.value : (prev?.markets ?? null),
    marketsAt: markets.status === "fulfilled" ? now : (prev?.marketsAt ?? null),
    fuel: fuel.status === "fulfilled" ? mergeFuel(prev?.fuel, fuel.value) : (prev?.fuel ?? null),
    fuelAt: fuel.status === "fulfilled" ? now : (prev?.fuelAt ?? null),
  };
  await env.CACHE.put(KEY, JSON.stringify(next));
  return next;
}
