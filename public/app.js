// SecFin Brief page: renders the brief JSON, search, ask, the live ticker and the weekly
// most-read list. No framework, no build step.
(() => {
  const TURNSTILE_SITE_KEY = "0x4AAAAAAFxqSKUj6BrChqz1"; // public by design; the secret is a Worker secret
  const TEXT = {
    th: {
      finance: "การเงิน", financeTitle: "การเงิน", why: "ทำไมต้องสนใจ", empty: "ยังไม่มีข่าวในหมวดนี้", none: "ยังไม่มีสรุปข่าว ระบบจะสรุปทุกเช้า 05:30 น.",
      error: "โหลดข้อมูลไม่สำเร็จ", today: "ล่าสุด", footer: "สรุปโดย AI จากหัวข้อและเนื้อหาย่อของแหล่งข่าว โปรดอ่านต้นฉบับก่อนตัดสินใจ",
      th: "ไทย", global: "ต่างประเทศ", raw: "หัวข้อต้นฉบับ (ยังไม่ได้สรุป)", sources: (n) => `${n} แหล่งข่าว`,
      searchHint: "ค้นข่าวย้อนหลัง 14 วัน", clear: "ปิด", results: (q) => `ผลการค้นหา "${q}"`, noHits: "ไม่พบข่าวที่ใกล้เคียง", searching: "กำลังค้นหา…",
      live: "ล่าสุด", popular: "อ่านมากสุดสัปดาห์นี้", askTab: "ถามข่าว", askTitle: "ถามข่าว", askBtn: "ถาม", asking: "กำลังหาคำตอบ…",
      askHint: "ถามเกี่ยวกับข่าว 14 วันล่าสุด AI ตอบจากข่าวในคลังเท่านั้นและบอกแหล่งที่มา", askNeedCheck: "รอการยืนยันว่าไม่ใช่บอทสักครู่",
      askSources: "แหล่งที่มา", weekly: "PDF สรุปประจำสัปดาห์", clicks: (n) => `${n} คลิก`,
      disasterTab: "อากาศ/ภัยพิบัติ", disasterTitle: "สภาพอากาศและภัยพิบัติ", north: "ภาคเหนือ",
    },
    en: {
      finance: "Finance", financeTitle: "Finance", why: "Why it matters", empty: "No stories in this section yet", none: "No brief yet. A new one is published every morning at 05:30 Thai time.",
      error: "Could not load the brief", today: "Latest", footer: "AI summaries of publisher headlines and snippets. Read the original before acting on it.",
      th: "Thailand", global: "Global", raw: "Original headline (not summarized)", sources: (n) => `${n} sources`,
      searchHint: "Search the last 14 days", clear: "Close", results: (q) => `Results for "${q}"`, noHits: "No related stories found", searching: "Searching…",
      live: "Live", popular: "Most read this week", askTab: "Ask", askTitle: "Ask the news", askBtn: "Ask", asking: "Finding an answer…",
      askHint: "Ask about the last 14 days of news. The AI answers only from stored stories and lists its sources.", askNeedCheck: "Waiting for the bot check, one moment",
      askSources: "Sources", weekly: "Weekly PDF digest", clicks: (n) => `${n} clicks`,
      disasterTab: "Weather", disasterTitle: "Weather and disasters", north: "Northern Thailand",
    },
  };
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

  let lang = "th";
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "th"; } catch {}
  let brief = null;
  let loaded = false;
  let turnstileToken = null;
  let turnstileId = null;

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) n.append(k);
    return n;
  };
  // Links carry data-kind/data-cat so one delegated listener can report clicks.
  const link = (href, text, kind, cat = "") =>
    el("a", { href, target: "_blank", rel: "noopener noreferrer", "data-kind": kind, "data-cat": cat }, text);

  function formatDate(iso) {
    const d = new Date(`${iso}T00:00:00+07:00`);
    return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  }
  const shortDate = (ms) => new Date(ms).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

  function renderItem(it, cat) {
    const meta = el("div", { class: "meta" });
    if (it.severity) meta.append(el("span", { class: `sev ${it.severity}` }, SEV[it.severity]));
    meta.append(el("span", { class: "chip" }, TEXT[lang][it.region]), el("span", {}, it.sourceName));
    if (it.north) meta.append(el("span", { class: "chip north" }, TEXT[lang].north));
    if (it.coverage > 1) meta.append(el("span", { class: "chip", title: (it.alsoReported || []).join(", ") }, TEXT[lang].sources(it.coverage)));
    const li = el("li", { class: "item" },
      el("h3", {}, link(it.url, it.title[lang], "brief", cat)),
      el("p", {}, it.summary[lang] || ""),
    );
    if (it.why) li.append(el("p", { class: "why" }, el("b", {}, `${TEXT[lang].why}: `), it.why[lang]));
    else li.append(el("p", { class: "why" }, TEXT[lang].raw));
    if (it.cves?.length) {
      const box = el("div", { class: "cves" });
      for (const c of it.cves) {
        const a = el("a", { class: "cve", href: `https://nvd.nist.gov/vuln/detail/${c.id}`, target: "_blank", rel: "noopener noreferrer" }, c.id);
        if (c.cvss !== null) a.append(` · CVSS ${c.cvss}`);
        if (c.kevAdded) a.append(" · ", el("span", { class: "kev", title: `CISA KEV ${c.kevAdded}` }, "KEV"));
        box.append(a);
      }
      li.append(box);
    }
    li.append(meta);
    return li;
  }

  function renderHit(h) {
    const meta = el("div", { class: "meta" },
      el("span", { class: "chip" }, TEXT[lang][h.region] ?? h.region),
      el("span", {}, h.sourceName),
      el("span", {}, shortDate(h.published)),
    );
    return el("li", { class: "item" }, el("h3", {}, link(h.url, h.title, "search", h.category)), el("p", {}, h.snippet), meta);
  }

  async function runSearch(q) {
    const box = $("#results");
    const list = box.querySelector(".items");
    box.hidden = false;
    $("#results-title").textContent = TEXT[lang].results(q);
    list.replaceChildren(el("li", { class: "empty" }, TEXT[lang].searching));
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || String(res.status));
      list.replaceChildren(...(data.hits.length ? data.hits.map(renderHit) : [el("li", { class: "empty" }, TEXT[lang].noHits)]));
    } catch (e) {
      list.replaceChildren(el("li", { class: "empty" }, e.message || TEXT[lang].error));
    }
    box.scrollIntoView({ block: "start" });
  }

  function render() {
    document.documentElement.lang = lang;
    $("#lang").textContent = lang === "th" ? "EN" : "ไทย";
    document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = TEXT[lang][n.dataset.i18n]; });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((n) => { n.placeholder = TEXT[lang][n.dataset.i18nPlaceholder]; });
    for (const cat of ["cyber", "it", "finance", "disaster"]) {
      const list = $(`#${cat} .items`);
      list.replaceChildren();
      const items = brief?.sections?.[cat] ?? [];
      if (items.length === 0) list.append(el("li", { class: "empty" }, brief ? TEXT[lang].empty : ""));
      else items.forEach((it) => list.append(renderItem(it, cat)));
    }
    if (loaded) $("#date").textContent = brief ? formatDate(brief.date) : TEXT[lang].none;
  }

  async function load(date) {
    try {
      const res = await fetch(date ? `/api/brief/${date}` : "/api/brief/latest");
      brief = res.ok ? await res.json() : null;
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
    } catch {
      brief = null;
      $("#date").textContent = TEXT[lang].error;
      return;
    }
    loaded = true;
    render();
  }

  async function loadDays() {
    try {
      const days = await (await fetch("/api/briefs")).json();
      const sel = $("#day");
      sel.replaceChildren(...days.map((d, i) => el("option", { value: i === 0 ? "" : d }, i === 0 ? `${TEXT[lang].today} (${d})` : d)));
      sel.hidden = days.length < 2;
    } catch {}
  }

  async function loadPopular() {
    try {
      const items = await (await fetch("/api/popular")).json();
      if (!Array.isArray(items) || items.length === 0) return;
      $("#popular").replaceChildren(...items.map((p) =>
        el("li", { class: "item" }, el("h3", {}, link(p.url, p.title, "popular", p.category)), el("div", { class: "meta" }, el("span", {}, TEXT[lang].clicks(p.clicks))))));
      $("#popular-box").hidden = false;
    } catch {}
  }

  // Live ticker: newest headlines pushed by the LiveFeed Durable Object.
  function startTicker() {
    const list = $("#ticker-list");
    let delay = 2000;
    const show = (items, fresh) => {
      for (const it of [...items].reverse()) {
        const li = el("li", fresh ? { class: "fresh" } : {}, link(it.url, `${it.sourceName}: ${it.title}`, "ticker", it.category));
        list.prepend(li);
      }
      while (list.children.length > 12) list.lastChild.remove();
      $("#ticker").hidden = list.children.length === 0;
    };
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      let ping;
      ws.onopen = () => { delay = 2000; ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 50000); };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "recent") { list.replaceChildren(); show(msg.items.slice(0, 12), false); }
          if (msg.type === "new") show(msg.items, true);
        } catch {}
      };
      ws.onclose = () => { clearInterval(ping); setTimeout(connect, delay); delay = Math.min(delay * 2, 60000); };
    };
    connect();
  }

  // Turnstile calls this once its script has loaded (render=explicit&onload=onTurnstileLoad).
  window.onTurnstileLoad = () => {
    turnstileId = window.turnstile.render("#turnstile", {
      sitekey: TURNSTILE_SITE_KEY,
      language: lang,
      callback: (t) => { turnstileToken = t; },
      "expired-callback": () => { turnstileToken = null; },
    });
  };

  async function runAsk(q) {
    const box = $("#answer");
    const btn = $("#ask-btn");
    box.hidden = false;
    if (!turnstileToken) { box.textContent = TEXT[lang].askNeedCheck; return; }
    btn.disabled = true;
    box.textContent = TEXT[lang].asking;
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, token: turnstileToken }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || String(res.status));
      box.replaceChildren(el("p", {}, data.answer));
      if (data.sources.length) {
        box.append(el("b", {}, TEXT[lang].askSources),
          el("ol", {}, ...data.sources.map((s) => el("li", { value: String(s.n) }, link(s.url, s.title, "ask"), ` (${s.sourceName}, ${shortDate(s.published)})`))));
      }
    } catch (e) {
      box.textContent = e.message || TEXT[lang].error;
    } finally {
      btn.disabled = false;
      // A Turnstile token is single-use.
      turnstileToken = null;
      if (turnstileId !== null) window.turnstile.reset(turnstileId);
    }
  }

  // One listener reports clicks on any tracked link to Analytics Engine.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[data-kind]");
    if (!a) return;
    const body = JSON.stringify({ url: a.href, kind: a.dataset.kind, category: a.dataset.cat });
    try { navigator.sendBeacon("/api/click", new Blob([body], { type: "application/json" })); } catch {}
  });

  $("#lang").addEventListener("click", () => {
    lang = lang === "th" ? "en" : "th";
    try { localStorage.setItem("lang", lang); } catch {}
    render();
  });
  $("#day").addEventListener("change", (e) => load(e.target.value));
  $("#search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q.length >= 2) runSearch(q);
  });
  $("#clear").addEventListener("click", () => {
    $("#results").hidden = true;
    $("#q").value = "";
  });
  $("#ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#ask-q").value.trim();
    if (q.length >= 5) runAsk(q);
  });

  render();
  load();
  loadDays();
  loadPopular();
  startTicker();
})();
