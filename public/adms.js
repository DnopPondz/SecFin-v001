// ADMS: the owner's dashboard. Visitors (time, place, source), interest in each brief story,
// and Free-plan quota use. Data comes from /api/adms/*, which needs the PIN session cookie.
(() => {
  const { el, t } = window.SF;

  Object.assign(window.SF.TEXT.th, {
    loginTitle: "เข้าสู่ระบบ ADMS", pinLabel: "PIN 10 หลัก", loginBtn: "เข้าสู่ระบบ",
    "wrong-pin": "PIN ไม่ถูกต้อง", "too-many": "ลองผิดหลายครั้งเกินไป รอ 1 นาทีแล้วลองใหม่",
    "pin-not-set": "ยังไม่ได้ตั้ง PIN ให้รัน npx wrangler secret put ADMS_PIN แล้วใส่ตัวเลข 10 หลัก",
    includeMe: "รวมการเข้าชมของฉัน", navVisitors: "ผู้เข้าชม", navStories: "ความสนใจต่อข่าว", navQuotas: "โควตา",
    refresh: "รีเฟรช", logout: "ออกจากระบบ", loading: "กำลังโหลด…", noData: "ยังไม่มีข้อมูลในช่วงนี้",
    kViews: "การเข้าชม", kVisitors: "ผู้เข้าชม", kVisitorsNote: "นับแยกรายวัน", kStories: "เปิดอ่านข่าว", kPerDay: "เฉลี่ยต่อวัน",
    byHour: "ช่วงเวลาที่เข้าชม (เวลาไทย)", trendDay: "รายวัน", trendHour: "24 ชั่วโมงล่าสุด",
    countries: "ประเทศ", cities: "เมือง", referrers: "มาจากไหน", devices: "อุปกรณ์และภาษา",
    direct: "เข้าตรง / bookmark", internal: "คลิกต่อภายในเว็บ", mobile: "มือถือ", tablet: "แท็บเล็ต", desktop: "คอมพิวเตอร์",
    langTh: "อ่านภาษาไทย", langEn: "อ่านภาษาอังกฤษ",
    insPeak: (h, n) => `ช่วงที่คนเข้าเยอะสุดคือ ${h} น. (${n} ครั้ง)`,
    insCountry: (c, p) => `${c} เป็นผู้เข้าชมหลัก ${p}%`, insMobile: (p) => `เข้าจากมือถือ ${p}%`,
    rateHelp: "อัตราความสนใจ = (เปิดอ่านข่าว + คลิกไปต้นฉบับ) ÷ จำนวนครั้งที่หน้าแรกของฉบับนั้นถูกเปิด ข่าวที่อ่านน้อยนับเฉพาะข่าวที่มีคนเห็นบนหน้าแรกแล้ว สูงสุดย้อนหลัง 14 วัน",
    topStories: "ข่าวที่คนสนใจมากสุด", bottomStories: "ข่าวที่คนอ่านน้อย", bySection: "ตามหมวด", byPosition: "ตามตำแหน่งในหมวด",
    colStory: "ข่าว", colSeen: "เห็นหน้าแรก", colReads: "อ่าน", colClicks: "คลิกต้นฉบับ", colRate: "อัตรา",
    pos: (i) => (i === 0 ? "ข่าวนำ" : `อันดับ ${i + 1}`), storiesCount: (n) => `${n} ข่าว`,
    insBestCat: (c, p) => `หมวด ${c} ได้ความสนใจสูงสุด ${p}%`,
    insLead: (x) => `ข่าวนำของแต่ละหมวดได้ความสนใจ ${x} เท่าของข่าวอันดับอื่นโดยเฉลี่ย`,
    insTop: (s) => `ข่าวที่คนสนใจสุด: ${s}`,
    quotaTitle: "โควตา Free plan", rateLimits: "Rate limit ต่อ IP", errorsTitle: "ข้อมูลที่ดึงไม่สำเร็จ",
    quotaHelp: "ค่ารายวันนับตามวัน UTC รีเซ็ต 07:00 น. เวลาไทย ข้อมูลจาก Cloudflare มีการสุ่มตัวอย่าง (sampling) จึงเป็นค่าประมาณ ไฟล์ static (HTML, CSS, JS, รูป) ไม่นับเป็น request ของ Worker",
    pDay: "วันนี้", pMonth: "เดือนนี้", pTotal: "ใช้อยู่", srcCf: "Cloudflare", srcMeter: "ระบบนับเอง",
    ok: "ปกติ", watch: "เฝ้าระวัง", high: "ใกล้เต็ม", unknown: "ไม่มีข้อมูล",
    q_workersRequests: "Workers requests", q_workersLogs: "Workers Logs", q_neurons: "Workers AI (Cloudflare)",
    q_neuronsMeter: "Workers AI (งบที่ตั้งเอง)", q_d1Read: "D1 rows read", q_d1Write: "D1 rows written", q_d1Storage: "D1 storage",
    q_kvRead: "KV reads", q_kvWrite: "KV writes", q_kvDelete: "KV deletes", q_kvList: "KV lists", q_kvStorage: "KV storage",
    q_queues: "Queues operations", q_workflows: "Workflows steps", q_vectorizeQueried: "Vectorize queried dimensions",
    q_vectorizeStored: "Vectorize stored dimensions",
    rl_api: "ทุก request ของ Worker", rl_search: "ค้นข่าว", rl_ask: "ถามข่าว (chatbot)", rl_login: "ใส่ PIN ADMS",
    perMin: (n) => `${n} ครั้ง/นาที`,
  });
  Object.assign(window.SF.TEXT.en, {
    loginTitle: "Sign in to ADMS", pinLabel: "10-digit PIN", loginBtn: "Sign in",
    "wrong-pin": "Wrong PIN", "too-many": "Too many attempts. Wait a minute and try again.",
    "pin-not-set": "No PIN yet. Run npx wrangler secret put ADMS_PIN and enter 10 digits.",
    includeMe: "Include my own visits", navVisitors: "Visitors", navStories: "Story interest", navQuotas: "Quotas",
    refresh: "Refresh", logout: "Sign out", loading: "Loading…", noData: "No data for this period yet",
    kViews: "Page views", kVisitors: "Visitors", kVisitorsNote: "counted per day", kStories: "Story reads", kPerDay: "Per day",
    byHour: "Time of day (Thai time)", trendDay: "By day", trendHour: "Last 24 hours",
    countries: "Countries", cities: "Cities", referrers: "Where they came from", devices: "Devices and language",
    direct: "Direct / bookmark", internal: "Internal navigation", mobile: "Mobile", tablet: "Tablet", desktop: "Desktop",
    langTh: "Reading in Thai", langEn: "Reading in English",
    insPeak: (h, n) => `Busiest hour is ${h} (${n} views)`,
    insCountry: (c, p) => `${c} accounts for ${p}% of views`, insMobile: (p) => `${p}% on mobile`,
    rateHelp: "Interest rate = (story reads + clicks to the publisher) ÷ front-page views of that edition. Least-read only counts stories that were shown on the front page. Up to 14 days back.",
    topStories: "Most interesting stories", bottomStories: "Least-read stories", bySection: "By section", byPosition: "By position in section",
    colStory: "Story", colSeen: "Front-page views", colReads: "Reads", colClicks: "Publisher clicks", colRate: "Rate",
    pos: (i) => (i === 0 ? "Lead" : `No. ${i + 1}`), storiesCount: (n) => `${n} stories`,
    insBestCat: (c, p) => `${c} draws the most interest at ${p}%`,
    insLead: (x) => `Lead stories get ${x}× the interest of other positions on average`,
    insTop: (s) => `Most interesting story: ${s}`,
    quotaTitle: "Free plan quotas", rateLimits: "Per-IP rate limits", errorsTitle: "Data that could not be read",
    quotaHelp: "Daily figures follow the UTC day and reset at 07:00 Thai time. Cloudflare figures are sampled, so they are estimates. Static files (HTML, CSS, JS, images) do not count as Worker requests.",
    pDay: "Today", pMonth: "This month", pTotal: "In use", srcCf: "Cloudflare", srcMeter: "Own meter",
    ok: "OK", watch: "Watch", high: "Near limit", unknown: "No data",
    q_workersRequests: "Workers requests", q_workersLogs: "Workers Logs", q_neurons: "Workers AI (Cloudflare)",
    q_neuronsMeter: "Workers AI (own budget)", q_d1Read: "D1 rows read", q_d1Write: "D1 rows written", q_d1Storage: "D1 storage",
    q_kvRead: "KV reads", q_kvWrite: "KV writes", q_kvDelete: "KV deletes", q_kvList: "KV lists", q_kvStorage: "KV storage",
    q_queues: "Queues operations", q_workflows: "Workflows steps", q_vectorizeQueried: "Vectorize queried dimensions",
    q_vectorizeStored: "Vectorize stored dimensions",
    rl_api: "Every Worker request", rl_search: "Search", rl_ask: "Ask (chatbot)", rl_login: "ADMS PIN entry",
    perMin: (n) => `${n} per minute`,
  });

  const $ = (s) => document.querySelector(s);
  const store = SF.store;
  let days = Number(store.get("admsDays")) || 7;
  let owner = store.get("admsOwner") === "1";
  let data = { traffic: null, stories: null, quotas: null };

  const fmt = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString(SF.lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 1 }));
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const ratePct = (r) => `${(r * 100).toFixed(1)}%`;
  const HOUR = 3600e3;
  const thai = (ms) => new Date(ms + 7 * HOUR);
  const parseUtc = (s) => Date.parse(String(s).replace(" ", "T") + (String(s).endsWith("Z") ? "" : "Z"));

  function regionName(code) {
    try { return new Intl.DisplayNames([SF.lang === "th" ? "th" : "en"], { type: "region" }).of(code) || code; } catch { return code; }
  }
  const flag = (code) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌐");

  // Horizontal bars: label, track, value. One series in the link colour; values stay in text colour.
  function bars(rows, total) {
    if (!rows.length) return el("p", { class: "empty" }, t("noData"));
    const max = Math.max(...rows.map((r) => r.value), 1);
    return el("div", { class: "bars" }, ...rows.map((r) => el("div", { class: "bar-row", title: `${r.label}: ${fmt(r.value)}` },
      el("span", { class: "bar-label" }, r.label),
      el("span", { class: "bar-track" }, el("span", { class: "bar-fill", style: `width:${Math.max(2, (r.value / max) * 100)}%` })),
      el("span", { class: "bar-val" }, fmt(r.value), total ? el("small", {}, ` ${pct(r.value, total)}%`) : null))));
  }

  // Vertical columns with a value on hover and sparse axis labels.
  function columns(points, every = 3) {
    if (!points.some((p) => p.value > 0)) return el("p", { class: "empty" }, t("noData"));
    const max = Math.max(...points.map((p) => p.value), 1);
    return el("div", { class: "cols", style: `--n:${points.length}` }, ...points.map((p, i) => el("div", { class: "col", title: `${p.label}: ${fmt(p.value)}` },
      el("span", { class: "col-bar", style: `height:${(p.value / max) * 100}%` }),
      el("span", { class: "col-label" }, i % every === 0 ? p.label : ""))));
  }

  function renderTraffic() {
    const tr = data.traffic;
    if (!tr) return;
    const span = days;
    $("#kpis").replaceChildren(
      kpi(t("kViews"), fmt(tr.views)),
      kpi(t("kVisitors"), fmt(tr.visitors), t("kVisitorsNote")),
      kpi(t("kStories"), fmt(tr.storyViews)),
      kpi(t("kPerDay"), fmt(Math.round((tr.views / span) * 10) / 10)),
    );
    // Hour of day in Thai time, from UTC hour buckets.
    const byHour = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, "0"), value: 0 }));
    const buckets = tr.hourly.map((r) => ({ ms: parseUtc(r.hour), views: r.views }));
    for (const b of buckets) byHour[thai(b.ms).getUTCHours()].value += b.views;
    $("#hours").replaceChildren(columns(byHour, 3));

    if (span === 1) {
      $("#trend-title").textContent = t("trendHour");
      const start = Math.floor((Date.now() - 23 * HOUR) / HOUR) * HOUR;
      const pts = Array.from({ length: 24 }, (_, i) => ({ ms: start + i * HOUR, label: String(thai(start + i * HOUR).getUTCHours()).padStart(2, "0"), value: 0 }));
      for (const b of buckets) { const p = pts.find((x) => x.ms === b.ms); if (p) p.value += b.views; }
      $("#trend").replaceChildren(columns(pts, 3));
    } else {
      $("#trend-title").textContent = t("trendDay");
      const pts = Array.from({ length: span }, (_, i) => {
        const d = thai(Date.now() - (span - 1 - i) * 24 * HOUR).toISOString().slice(0, 10);
        return { day: d, label: d.slice(8, 10), value: 0 };
      });
      for (const b of buckets) { const d = thai(b.ms).toISOString().slice(0, 10); const p = pts.find((x) => x.day === d); if (p) p.value += b.views; }
      $("#trend").replaceChildren(columns(pts, span > 10 ? 5 : 1));
    }

    $("#countries").replaceChildren(bars(tr.countries.map((c) => ({ label: `${flag(c.country)} ${regionName(c.country)}`, value: c.views })), tr.views));
    $("#cities").replaceChildren(bars(tr.cities.filter((c) => c.city || c.region).map((c) => ({ label: [c.city, c.region !== c.city ? c.region : "", c.country].filter(Boolean).join(", "), value: c.views })), tr.views));
    $("#referrers").replaceChildren(bars(tr.referrers.map((r) => ({ label: r.ref === "direct" ? t("direct") : r.ref === "internal" ? t("internal") : r.ref, value: r.views })), tr.views));
    $("#devices").replaceChildren(
      bars(tr.devices.map((d) => ({ label: t(d.device), value: d.views })), tr.views),
      bars(tr.langs.map((l) => ({ label: l.lang === "en" ? t("langEn") : t("langTh"), value: l.views })), tr.views),
    );

    const ins = [];
    const peak = [...byHour].sort((a, b) => b.value - a.value)[0];
    if (peak?.value) ins.push(t("insPeak", `${peak.label}:00`, fmt(peak.value)));
    if (tr.countries[0]) ins.push(t("insCountry", regionName(tr.countries[0].country), pct(tr.countries[0].views, tr.views)));
    const mobile = tr.devices.find((d) => d.device === "mobile");
    if (mobile) ins.push(t("insMobile", pct(mobile.views, tr.views)));
    $("#insights").replaceChildren(...ins.map((s) => el("p", {}, s)));
  }

  function kpi(label, value, note) {
    return el("div", { class: "kpi" }, el("span", { class: "kpi-label" }, label), el("span", { class: "kpi-value" }, value), note ? el("span", { class: "kpi-note" }, note) : null);
  }

  function storyTable(rows) {
    if (!rows.length) return el("p", { class: "empty" }, t("noData"));
    const head = el("tr", {}, ...["#", t("colStory"), t("colSeen"), t("colReads"), t("colClicks"), t("colRate")].map((h, i) => el("th", { class: i > 1 ? "num" : null }, h)));
    return el("div", { class: "table-wrap" }, el("table", { class: "adms-table" }, el("thead", {}, head), el("tbody", {}, ...rows.map((s, i) => el("tr", {},
      el("td", { class: "num" }, String(i + 1)),
      el("td", {}, el("a", { href: `/story?id=${s.id}&d=${s.date}`, target: "_blank", rel: "noopener" }, s.title),
        el("div", { class: "meta" }, el("span", { class: "chip" }, t(s.category)), el("span", {}, t("pos", s.position)), el("span", {}, s.date), el("span", {}, s.sourceName))),
      el("td", { class: "num" }, fmt(s.impressions)),
      el("td", { class: "num" }, fmt(s.reads)),
      el("td", { class: "num" }, fmt(s.clicks)),
      el("td", { class: "num" }, s.impressions ? ratePct(s.rate) : "–"))))));
  }

  function renderStories() {
    const st = data.stories;
    if (!st) return;
    $("[data-t='rateHelp']").textContent = t("rateHelp");
    $("#top").replaceChildren(storyTable(st.top.filter((s) => s.reads + s.clicks > 0)));
    $("#bottom").replaceChildren(storyTable(st.bottom));
    const groupBars = (groups, label) => bars(groups.map((g) => ({ label: `${label(g.key)} (${t("storiesCount", g.stories)})`, value: Math.round(g.rate * 1000) / 10 })));
    $("#by-cat").replaceChildren(groupBars(st.byCategory, (k) => t(k)));
    $("#by-pos").replaceChildren(groupBars([...st.byPosition].sort((a, b) => Number(a.key) - Number(b.key)), (k) => t("pos", Number(k))));
    // Bars in these two boxes are rates in percent.
    document.querySelectorAll("#by-cat .bar-val, #by-pos .bar-val").forEach((n) => { n.textContent += "%"; });

    const ins = [];
    const bestCat = [...st.byCategory].filter((g) => g.impressions > 0).sort((a, b) => b.rate - a.rate)[0];
    if (bestCat?.rate) ins.push(t("insBestCat", t(bestCat.key), (bestCat.rate * 100).toFixed(1)));
    const lead = st.byPosition.find((g) => g.key === "0");
    const rest = st.byPosition.filter((g) => g.key !== "0");
    const restImp = rest.reduce((n, g) => n + g.impressions, 0);
    const restRate = restImp ? rest.reduce((n, g) => n + g.reads + g.clicks, 0) / restImp : 0;
    if (lead?.rate && restRate) ins.push(t("insLead", (lead.rate / restRate).toFixed(1)));
    if (st.top[0] && st.top[0].reads + st.top[0].clicks > 0) ins.push(t("insTop", st.top[0].title));
    $("#story-insights").replaceChildren(...ins.map((s) => el("p", {}, s)));
  }

  function status(p) {
    if (p === null) return ["unknown", t("unknown")];
    if (p >= 85) return ["high", t("high")];
    if (p >= 60) return ["watch", t("watch")];
    return ["ok", t("ok")];
  }

  function renderQuotas() {
    const q = data.quotas;
    if (!q) return;
    $("[data-t='quotaHelp']").textContent = t("quotaHelp");
    $("#quota-list").replaceChildren(el("div", { class: "quotas" }, ...q.quotas.map((x) => {
      const p = x.used === null ? null : Math.min(100, (x.used / x.limit) * 100);
      const [cls, label] = status(p);
      return el("div", { class: `quota ${cls}` },
        el("div", { class: "quota-head" },
          el("span", { class: "quota-name" }, t(`q_${x.id}`)),
          el("span", { class: "quota-state" }, el("span", { class: "quota-dot", "aria-hidden": "true" }), label)),
        el("div", { class: "quota-track" }, el("span", { class: "quota-fill", style: `width:${p === null ? 0 : Math.max(1, p)}%` })),
        el("div", { class: "meta" },
          el("span", {}, `${fmt(x.used)} / ${fmt(x.limit)} ${x.unit}`),
          el("span", {}, p === null ? "" : `${p.toFixed(p < 1 ? 2 : 1)}%`),
          el("span", {}, x.period === "day" ? t("pDay") : x.period === "month" ? t("pMonth") : t("pTotal")),
          el("span", { class: "chip" }, x.source === "meter" ? t("srcMeter") : t("srcCf"))));
    })));
    $("#rate-limits").replaceChildren(bars([
      { label: t("rl_api"), value: 60 }, { label: t("rl_search"), value: 10 }, { label: t("rl_ask"), value: 3 }, { label: t("rl_login"), value: 5 },
    ]));
    document.querySelectorAll("#rate-limits .bar-val").forEach((n) => { n.textContent = t("perMin", n.textContent); });
    const errors = [...(data.traffic?.errors ?? []), ...(data.stories?.errors ?? []), ...q.errors];
    $("#errors").hidden = errors.length === 0;
    $("#error-list").replaceChildren(...errors.map((e) => el("li", {}, e)));
  }

  function renderAll() {
    renderTraffic();
    renderStories();
    renderQuotas();
  }

  async function get(path) {
    const res = await fetch(path, { headers: { accept: "application/json" } });
    if (res.status === 401) throw Object.assign(new Error("signed-out"), { signedOut: true });
    return res.json();
  }

  async function loadAll() {
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));
    $("#owner").checked = owner;
    for (const id of ["#kpis", "#top", "#quota-list"]) $(id).replaceChildren(el("p", { class: "empty" }, t("loading")));
    const q = `days=${days}&owner=${owner ? 1 : 0}`;
    try {
      const [traffic, stories, quotas] = await Promise.all([get(`/api/adms/traffic?${q}`), get(`/api/adms/stories?${q}`), get("/api/adms/quotas")]);
      data = { traffic, stories, quotas };
      renderAll();
    } catch (e) {
      if (e.signedOut) showLogin();
    }
  }

  function showLogin(message) {
    $("#dash").hidden = true;
    $("#login").hidden = false;
    $("#login-status").textContent = message || "";
    $("#pin").value = "";
    $("#pin").focus();
  }

  function showDash() {
    $("#login").hidden = true;
    $("#dash").hidden = false;
    loadAll();
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = $("#pin").value.trim();
    if (!/^\d{10}$/.test(pin)) { $("#login-status").textContent = t("wrong-pin"); return; }
    const res = await fetch("/api/adms/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) showDash();
    else showLogin(t(body.error || "wrong-pin"));
  });
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    days = Number(b.dataset.days);
    store.set("admsDays", String(days));
    loadAll();
  }));
  $("#owner").addEventListener("change", (e) => { owner = e.target.checked; store.set("admsOwner", owner ? "1" : ""); loadAll(); });
  $("#refresh").addEventListener("click", loadAll);
  $("#logout").addEventListener("click", async () => { await fetch("/api/adms/logout", { method: "POST" }); showLogin(); });

  SF.initControls();
  SF.onLang(renderAll);
  fetch("/api/adms/session").then((r) => r.json()).then((s) => (s.ok ? showDash() : showLogin(s.configured ? "" : t("pin-not-set")))).catch(() => showLogin());
})();
