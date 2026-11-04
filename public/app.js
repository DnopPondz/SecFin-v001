// Front page: hero story, one block per section, search, side panels, most read and the archive
// picker. Asking the news is the floating chat in chat.js.
(() => {
  const { el, link, media, kicker, meta, storyHref, t } = window.SF;
  const CATS = ["cyber", "it", "finance", "disaster"];
  const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

  Object.assign(window.SF.TEXT.th, {
    popular: "อ่านมากสุดสัปดาห์นี้",
    archive: "ฉบับย้อนหลัง", weekly: "PDF สรุปประจำสัปดาห์", latest: "ฉบับล่าสุด", close: "ปิด", searchHint: "ค้นข่าวย้อนหลัง 14 วัน",
    results: (q) => `ผลการค้นหา "${q}"`, noHits: "ไม่พบข่าวที่ใกล้เคียง", searching: "กำลังค้นหา…", empty: "ยังไม่มีข่าวในหมวดนี้",
    none: "ยังไม่มีสรุปข่าว ระบบจะสรุปทุกเช้า 05:30 น.", clicks: (n) => `${n} คลิก`,
    footer: "สรุปโดย AI จากหัวข้อและเนื้อหาย่อของแหล่งข่าว รูปภาพเป็นของแหล่งข่าวต้นฉบับ โปรดอ่านต้นฉบับก่อนตัดสินใจ",
    edition: (d) => `ฉบับวันที่ ${d}`,
    airTitle: "ฝุ่น PM2.5 ภาคเหนือ", airAvg: "เฉลี่ย 24 ชม.", airNow: (v) => `ล่าสุด ${v} µg/m³`, air24: "24 ชั่วโมงที่ผ่านมา",
    airSrc: (time) => `ค่าประมาณจากแบบจำลอง CAMS ผ่าน Open-Meteo ไม่ใช่ค่าจากสถานีตรวจวัด เกณฑ์สีตามกรมควบคุมมลพิษ · ข้อมูล ${time} น.`,
    airPick: "จังหวัดของคุณ", airLimit: "37.5 เริ่มมีผลต่อสุขภาพ",
    marketsTitle: "ตลาด", btc24: "24 ชม.", mkFx: "ค่าเงิน", mkCommodities: "สินค้าโภคภัณฑ์", mkCrypto: "คริปโต",
    gold: "ทองคำ", goldBaht: (v) => `≈ ทองแท่ง 96.5% บาทละ ${v} บาท (ประมาณจากราคาโลก ไม่ใช่ราคาสมาคมค้าทองคำ)`,
    srcFx: (d) => `ค่าเงิน: อัตราอ้างอิง ECB วันที่ ${d} (Frankfurter)`, srcGold: "ทองคำ: ราคา spot จาก gold-api.com",
    srcOil: (d) => `น้ำมันดิบ: ราคา spot ของ EIA วันที่ ${d} (ช้ากว่าตลาดประมาณ 1 สัปดาห์)`, srcBtc: "BTC: CoinGecko",
    fuelTitle: "ราคาน้ำมันในไทย", fuelUnit: "บาท/ลิตร", fuelSame: "คงที่",
    fuelSrc: (d) => `ราคาขายปลีก ปตท. ในกรุงเทพฯ มีผล ${d} น. ต่างจังหวัดอาจสูงกว่าเล็กน้อย · ที่มา: PTT OR`,
    fuelChange: "เทียบกับราคาก่อนปรับครั้งล่าสุด",
    watchTitle: "ตรงกับ watchlist", watchHint: "ข่าว 3 วันล่าสุดที่ตรงกับคำที่ตั้งไว้",
  });
  Object.assign(window.SF.TEXT.en, {
    popular: "Most read this week",
    archive: "Archive", weekly: "Weekly PDF digest", latest: "Latest edition", close: "Close", searchHint: "Search the last 14 days",
    results: (q) => `Results for "${q}"`, noHits: "No related stories found", searching: "Searching…", empty: "No stories in this section yet",
    none: "No brief yet. A new one is published every morning at 05:30 Thai time.", clicks: (n) => `${n} clicks`,
    footer: "AI summaries of publisher headlines and snippets. Images belong to the original publishers. Read the original before acting on it.",
    edition: (d) => `Edition of ${d}`,
    airTitle: "PM2.5 in the North", airAvg: "24 h mean", airNow: (v) => `Latest ${v} µg/m³`, air24: "Last 24 hours",
    airSrc: (time) => `CAMS model estimate via Open-Meteo, not a station reading. Colours follow the Thai Pollution Control Department bands · data ${time}`,
    airPick: "Your province", airLimit: "37.5 health effects begin",
    marketsTitle: "Markets", btc24: "24 h", mkFx: "Currencies", mkCommodities: "Commodities", mkCrypto: "Crypto",
    gold: "Gold", goldBaht: (v) => `≈ ${v} THB per baht-weight of 96.5% bar gold (estimated from spot, not the Gold Traders Association price)`,
    srcFx: (d) => `FX: ECB reference rates of ${d} (Frankfurter)`, srcGold: "Gold: spot price from gold-api.com",
    srcOil: (d) => `Crude: EIA spot prices, ${d} (about a week behind the market)`, srcBtc: "BTC: CoinGecko",
    fuelTitle: "Fuel prices in Thailand", fuelUnit: "THB/litre", fuelSame: "unchanged",
    fuelSrc: (d) => `PTT pump prices in Bangkok, effective ${d}. Provinces may be slightly higher · Source: PTT OR`,
    fuelChange: "Versus the price before the latest change",
    watchTitle: "On your watchlist", watchHint: "Stories from the last 3 days matching your terms",
  });

  // Thai PCD bands for the 24 h mean (mirrors PM25_BANDS in src/widgets.ts).
  const PM_BANDS = [
    { max: 15, th: "ดีมาก", en: "Very good" },
    { max: 25, th: "ดี", en: "Good" },
    { max: 37.5, th: "ปานกลาง", en: "Moderate" },
    { max: 75, th: "เริ่มมีผลกระทบต่อสุขภาพ", en: "Starting to affect health" },
    { max: Infinity, th: "มีผลกระทบต่อสุขภาพ", en: "Affects health" },
  ];
  const pmLevel = (v) => PM_BANDS.findIndex((b) => Math.round(v * 10) / 10 <= b.max);

  let brief = null;
  let edition = new URLSearchParams(location.search).get("d") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edition)) edition = "";
  let widgets = null;
  let watchItems = [];
  const $ = (s) => document.querySelector(s);

  function headline(it, cat, tag) {
    return el(tag, { class: "headline" }, link(storyHref(it), it.title[SF.lang], "brief", cat, it.url));
  }

  function leadCard(it, cat) {
    const href = storyHref(it);
    return el("article", { class: "lead" },
      media(it, cat, href),
      kicker(it, cat),
      headline(it, cat, "h3"),
      el("p", { class: "dek" }, it.summary[SF.lang] || ""),
      it.why ? el("p", { class: "why-line" }, el("b", {}, `${t("why")}: `), it.why[SF.lang]) : null,
      meta(it),
    );
  }

  function rowCard(it, cat) {
    return el("article", { class: "row" },
      media(it, cat, storyHref(it)),
      el("div", {}, kicker(it, cat), headline(it, cat, "h4"), meta(it)),
    );
  }

  // The most severe lead story of the day goes on top; ties keep section order.
  function pickHero() {
    let best = null;
    for (const cat of CATS) {
      const it = brief?.sections?.[cat]?.[0];
      if (!it) continue;
      const score = (SEV_RANK[it.severity] ?? 0) * 10 + (it.coverage ?? 1) + (it.image ? 0.5 : 0);
      if (!best || score > best.score) best = { it, cat, score };
    }
    return best;
  }

  function render() {
    $("#q").placeholder = t("searchHint");
    const hero = pickHero();
    const heroBox = $("#hero");
    if (hero) {
      const { it, cat } = hero;
      heroBox.replaceChildren(
        media(it, cat, storyHref(it)),
        el("div", {}, kicker(it, cat), headline(it, cat, "h2"), el("p", { class: "dek" }, it.summary[SF.lang] || ""),
          it.why ? el("p", { class: "why-line" }, el("b", {}, `${t("why")}: `), it.why[SF.lang]) : null, meta(it)),
      );
      heroBox.hidden = false;
    } else {
      heroBox.replaceChildren(el("p", { class: "empty" }, brief ? "" : t("none")));
    }
    for (const cat of CATS) {
      const body = $(`#${cat} .block-body`);
      const items = (brief?.sections?.[cat] ?? []).filter((it) => !(hero && hero.it === it));
      if (items.length === 0) { body.replaceChildren(el("p", { class: "empty" }, t("empty"))); continue; }
      const [lead, ...rest] = items;
      body.replaceChildren(leadCard(lead, cat), el("div", { class: "list" }, ...rest.map((it) => rowCard(it, cat))));
    }
    $("#notes").textContent = brief?.notes?.length ? brief.notes.join(" · ") : "";
  }

  // ?d=YYYY-MM-DD opens an archived edition, so each edition has its own link.
  async function load(date) {
    edition = date || "";
    SF.setEdition(edition);
    history.replaceState(null, "", edition ? `/?d=${edition}` : "/");
    try {
      const res = await fetch(edition ? `/api/brief/${edition}` : "/api/brief/latest");
      brief = res.ok ? await res.json() : null;
    } catch {
      brief = null;
    }
    render();
    // Keep today's write-ups on the device for reading offline.
    if (brief && !edition) {
      SF.precache(Object.values(brief.sections || {}).flat().filter((it) => it.id).map((it) => `/api/story/${it.id}`));
    }
  }

  async function loadDays() {
    try {
      const days = await (await fetch("/api/briefs")).json();
      const draw = () => {
        $("#day").replaceChildren(...days.map((d, i) => el("option", { value: i === 0 ? "" : d }, i === 0 ? `${t("latest")} (${d})` : t("edition", d))));
        $("#day").value = days.indexOf(edition) > 0 ? edition : "";
      };
      draw();
      SF.onLang(draw);
    } catch {}
  }

  // Small line chart: one series, 2px line, value readout on hover or touch.
  function sparkline(values, { width = 280, height = 48, zero = false, limit = null, label = (i) => "", format = (v) => String(v) } = {}) {
    const NS = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    const pad = 4;
    const lo = zero ? 0 : Math.min(...values);
    const hi = Math.max(...values, limit ?? -Infinity);
    const span = hi - lo || 1;
    const x = (i) => pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = (v) => height - pad - ((v - lo) / span) * (height - pad * 2);
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "spark", role: "img", "aria-label": values.map(format).join(", ") });
    if (limit !== null && limit <= hi) svg.append(svgEl("line", { x1: pad, x2: width - pad, y1: y(limit), y2: y(limit), class: "spark-limit" }));
    svg.append(svgEl("polyline", { points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "), class: "spark-line" }));
    const dot = svgEl("circle", { r: 4, class: "spark-dot", cx: x(values.length - 1), cy: y(values.at(-1)) });
    svg.append(dot);
    const readout = el("div", { class: "spark-readout" }, `${label(values.length - 1)} ${format(values.at(-1))}`);
    const show = (e) => {
      const box = svg.getBoundingClientRect();
      const i = Math.round(((e.clientX - box.left) / box.width) * (values.length - 1));
      const k = Math.min(Math.max(i, 0), values.length - 1);
      dot.setAttribute("cx", x(k));
      dot.setAttribute("cy", y(values[k]));
      readout.textContent = `${label(k)} ${format(values[k])}`;
    };
    const reset = () => show({ clientX: svg.getBoundingClientRect().right });
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerleave", reset);
    return el("div", { class: "spark-wrap" }, svg, readout);
  }

  const bandOf = (v) => (v === null || v === undefined ? null : pmLevel(v));
  const pm = (v) => (typeof v === "number" ? v.toFixed(1) : "-");
  const fmtTime = (iso) => (iso ? iso.slice(11, 16) : "");

  function renderAir() {
    const air = widgets?.air;
    const box = $("#air-box");
    if (!air?.readings?.length) { box.hidden = true; return; }
    const home = SF.store.get("airHome") || "chiangmai";
    const r = air.readings.find((x) => x.id === home) || air.readings[0];
    const L = SF.lang;
    const level = bandOf(r.avg24 ?? r.pm25);
    const pick = el("select", { id: "air-home", "aria-label": t("airPick") },
      ...air.readings.map((p) => el("option", { value: p.id, selected: p.id === r.id ? "" : null }, p.name[L])));
    pick.addEventListener("change", () => { SF.store.set("airHome", pick.value); renderAir(); });
    // Hours for the readout: the trend ends at the model hour and steps back one hour per point.
    const endHour = Number(fmtTime(air.time).slice(0, 2)) || 0;
    const hourLabel = (i) => `${String((endHour - (r.trend.length - 1 - i) + 48) % 24).padStart(2, "0")}:00`;
    const others = air.readings.filter((p) => p.id !== r.id).sort((a, b) => (b.avg24 ?? -1) - (a.avg24 ?? -1));
    $("#air").replaceChildren(
      pick,
      el("div", { class: "air-now" },
        el("span", { class: "air-value" }, pm(r.avg24 ?? r.pm25), el("small", {}, " µg/m³")),
        el("div", {},
          el("div", { class: "air-band" }, level !== null ? el("span", { class: `pm-dot pm${level}`, "aria-hidden": "true" }) : null, level !== null ? PM_BANDS[level][L] : ""),
          el("div", { class: "meta" }, `${t("airAvg")} · ${t("airNow", pm(r.pm25))}`))),
      r.trend.length > 1 ? sparkline(r.trend, { zero: true, limit: 37.5, label: hourLabel, format: (v) => `${pm(v)} µg/m³` }) : null,
      el("ul", { class: "air-list" }, ...others.map((p) => {
        const lv = bandOf(p.avg24);
        return el("li", { title: lv !== null ? PM_BANDS[lv][L] : "" },
          el("span", { class: `pm-dot pm${lv ?? "x"}`, "aria-hidden": "true" }), el("span", {}, p.name[L]), el("b", {}, pm(p.avg24)));
      })),
      el("p", { class: "src" }, t("airSrc", fmtTime(air.time))),
    );
    box.hidden = false;
  }

  // One row: name and unit, a 10-point sparkline when there is history, value and change.
  const arrow = (c) => (c > 0 ? "▲" : c < 0 ? "▼" : "");
  const num = (v, digits) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  function marketRow(name, unit, series, value, change, digits, changeText) {
    return el("li", {},
      el("span", { class: "mk-name" }, name, el("small", {}, ` ${unit}`)),
      series?.length > 1 ? sparkline(series, { width: 90, height: 26, format: (v) => num(v, digits) }).firstChild : el("span"),
      el("span", { class: "mk-val" }, num(value, digits),
        change !== null && change !== undefined ? el("small", {}, ` ${arrow(change)}${changeText ?? num(Math.abs(change), digits)}`) : null));
  }

  function renderMarkets() {
    const m = widgets?.markets;
    const box = $("#markets-box");
    if (!m || (!m.fx?.length && !m.btc && !m.gold && !m.oil?.length)) { box.hidden = true; return; }
    const group = (label, rows) => (rows.length ? [el("li", { class: "mk-group" }, label), ...rows] : []);
    const fx = (m.fx || []).map((r) => marketRow(r.code === "JPY" ? "JPY (100)" : r.code, "/THB", r.series, r.thb, r.change, 3));
    const commodities = [];
    if (m.gold) {
      commodities.push(marketRow(t("gold"), "/oz", m.gold.series, m.gold.usd, m.gold.change, 2));
      if (m.gold.thbBaht) commodities.push(el("li", { class: "mk-note" }, t("goldBaht", num(m.gold.thbBaht, 0))));
    }
    for (const o of m.oil || []) commodities.push(marketRow(o.code === "BRENT" ? "Brent" : "WTI", "/bbl", o.series, o.usd, o.change, 2));
    const crypto = m.btc ? [marketRow("BTC", "/USD", null, m.btc.usd, m.btc.change24h, 0, m.btc.change24h !== null ? `${Math.abs(m.btc.change24h).toFixed(2)}% ${t("btc24")}` : null)] : [];
    const src = [
      m.fx?.length ? t("srcFx", m.fx[0].date) : null,
      m.gold ? t("srcGold") : null,
      m.oil?.length ? t("srcOil", m.oil[0].date) : null,
      m.btc ? t("srcBtc") : null,
    ].filter(Boolean);
    $("#markets").replaceChildren(
      el("ul", { class: "markets" }, ...group(t("mkFx"), fx), ...group(t("mkCommodities"), commodities), ...group(t("mkCrypto"), crypto)),
      el("p", { class: "src" }, ...src.map((s) => el("span", { class: "src-line" }, s))),
    );
    box.hidden = false;
  }

  // Thai pump prices: one row per grade, change since the last price move.
  function renderFuel() {
    const f = widgets?.fuel;
    const box = $("#fuel-box");
    if (!f?.prices?.length) { box.hidden = true; return; }
    const L = SF.lang;
    const when = new Date(`${f.effective}:00+07:00`).toLocaleString(L === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    $("#fuel").replaceChildren(
      el("ul", { class: "fuel" }, ...f.prices.map((p) => el("li", {},
        el("span", { class: "fuel-name" }, p.name[L]),
        el("span", { class: "fuel-val" }, p.price.toFixed(2), el("small", {}, ` ${t("fuelUnit")}`)),
        el("span", { class: "fuel-chg", title: t("fuelChange") },
          p.change === null ? "" : p.change === 0 ? t("fuelSame") : `${arrow(p.change)}${Math.abs(p.change).toFixed(2)}`)))),
      el("p", { class: "src" }, t("fuelSrc", when)),
    );
    box.hidden = false;
  }

  async function loadWidgets() {
    try {
      const res = await fetch("/api/widgets");
      widgets = res.ok ? await res.json() : null;
    } catch {
      widgets = null;
    }
    renderAir();
    renderMarkets();
    renderFuel();
  }

  function renderWatch() {
    $("#watch-box").hidden = watchItems.length === 0;
    $("#watch").replaceChildren(...watchItems.map((w) => el("li", {},
      link(w.url, w.title, "watch", w.category, w.url),
      el("div", { class: "meta" }, el("span", {}, w.sourceName), el("span", {}, SF.timeAgo(w.published)),
        ...w.watch.map((term) => el("span", { class: "chip watch" }, `★ ${term}`))))));
  }

  async function loadWatch() {
    try {
      const items = await (await fetch("/api/watch")).json();
      watchItems = Array.isArray(items) ? items : [];
    } catch {
      watchItems = [];
    }
    renderWatch();
  }

  async function loadPopular() {
    try {
      const items = await (await fetch("/api/popular")).json();
      if (!Array.isArray(items) || items.length === 0) return;
      $("#popular").replaceChildren(...items.map((p) => el("li", {}, el("div", {}, link(p.url, p.title, "popular", p.category, p.url), el("div", { class: "meta" }, t("clicks", p.clicks))))));
      $("#popular-box").hidden = false;
    } catch {}
  }

  function renderHit(h) {
    return el("article", { class: "row" },
      media(h, h.category, h.url),
      el("div", {},
        el("div", { class: "kicker" }, t(h.category)),
        el("h4", { class: "headline" }, link(h.url, h.title, "search", h.category, h.url)),
        el("div", { class: "meta" }, el("span", {}, h.sourceName), el("span", {}, SF.timeAgo(h.published)))),
    );
  }

  async function runSearch(q) {
    const box = $("#results");
    const list = $("#results-list");
    box.hidden = false;
    $("#results-title").textContent = t("results", q);
    list.replaceChildren(el("p", { class: "empty" }, t("searching")));
    box.scrollIntoView({ block: "start" });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || String(res.status));
      list.replaceChildren(...(data.hits.length ? data.hits.map(renderHit) : [el("p", { class: "empty" }, t("noHits"))]));
    } catch (e) {
      list.replaceChildren(el("p", { class: "empty" }, e.message || t("error")));
    }
  }

  $("#day").addEventListener("change", (e) => load(e.target.value));
  $("#search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q.length >= 2) runSearch(q);
  });
  $("#clear").addEventListener("click", () => { $("#results").hidden = true; $("#q").value = ""; });

  SF.initControls();
  SF.onLang(render);
  SF.onLang(renderAir);
  SF.onLang(renderMarkets);
  SF.onLang(renderFuel);
  SF.onLang(renderWatch);
  SF.startTicker();
  load(edition);
  loadDays();
  loadPopular();
  loadWidgets();
  loadWatch();
})();
