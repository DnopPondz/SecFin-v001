// Front page: hero story, one block per section, search, ask, most read and the archive picker.
(() => {
  const { el, link, media, kicker, meta, storyHref, t } = window.SF;
  const TURNSTILE_SITE_KEY = "0x4AAAAAAFxqSKUj6BrChqz1"; // public by design; the secret is a Worker secret
  const CATS = ["cyber", "it", "finance", "disaster"];
  const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

  Object.assign(window.SF.TEXT.th, {
    popular: "อ่านมากสุดสัปดาห์นี้", askTitle: "ถามข่าว", askBtn: "ถาม", asking: "กำลังหาคำตอบ…", askSources: "แหล่งที่มา",
    askHint: "ถามเกี่ยวกับข่าว 14 วันล่าสุด AI ตอบจากข่าวในคลังเท่านั้นและบอกแหล่งที่มา", askNeedCheck: "รอการยืนยันว่าไม่ใช่บอทสักครู่",
    archive: "ฉบับย้อนหลัง", weekly: "PDF สรุปประจำสัปดาห์", latest: "ฉบับล่าสุด", close: "ปิด", searchHint: "ค้นข่าวย้อนหลัง 14 วัน",
    results: (q) => `ผลการค้นหา "${q}"`, noHits: "ไม่พบข่าวที่ใกล้เคียง", searching: "กำลังค้นหา…", empty: "ยังไม่มีข่าวในหมวดนี้",
    none: "ยังไม่มีสรุปข่าว ระบบจะสรุปทุกเช้า 05:30 น.", clicks: (n) => `${n} คลิก`,
    footer: "สรุปโดย AI จากหัวข้อและเนื้อหาย่อของแหล่งข่าว รูปภาพเป็นของแหล่งข่าวต้นฉบับ โปรดอ่านต้นฉบับก่อนตัดสินใจ",
    edition: (d) => `ฉบับวันที่ ${d}`,
  });
  Object.assign(window.SF.TEXT.en, {
    popular: "Most read this week", askTitle: "Ask the news", askBtn: "Ask", asking: "Finding an answer…", askSources: "Sources",
    askHint: "Ask about the last 14 days of news. The AI answers only from stored stories and lists its sources.", askNeedCheck: "Waiting for the bot check, one moment",
    archive: "Archive", weekly: "Weekly PDF digest", latest: "Latest edition", close: "Close", searchHint: "Search the last 14 days",
    results: (q) => `Results for "${q}"`, noHits: "No related stories found", searching: "Searching…", empty: "No stories in this section yet",
    none: "No brief yet. A new one is published every morning at 05:30 Thai time.", clicks: (n) => `${n} clicks`,
    footer: "AI summaries of publisher headlines and snippets. Images belong to the original publishers. Read the original before acting on it.",
    edition: (d) => `Edition of ${d}`,
  });

  let brief = null;
  let turnstileToken = null;
  let turnstileId = null;
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

  async function load(date) {
    try {
      const res = await fetch(date ? `/api/brief/${date}` : "/api/brief/latest");
      brief = res.ok ? await res.json() : null;
    } catch {
      brief = null;
    }
    render();
  }

  async function loadDays() {
    try {
      const days = await (await fetch("/api/briefs")).json();
      const draw = () => $("#day").replaceChildren(...days.map((d, i) => el("option", { value: i === 0 ? "" : d }, i === 0 ? `${t("latest")} (${d})` : t("edition", d))));
      draw();
      SF.onLang(draw);
    } catch {}
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

  // Turnstile calls this once its script has loaded (render=explicit&onload=onTurnstileLoad).
  window.onTurnstileLoad = () => {
    turnstileId = window.turnstile.render("#turnstile", {
      sitekey: TURNSTILE_SITE_KEY,
      language: SF.lang,
      size: "flexible",
      callback: (tok) => { turnstileToken = tok; },
      "expired-callback": () => { turnstileToken = null; },
    });
  };

  async function runAsk(q) {
    const box = $("#answer");
    const btn = $("#ask-btn");
    box.hidden = false;
    if (!turnstileToken) { box.textContent = t("askNeedCheck"); return; }
    btn.disabled = true;
    box.textContent = t("asking");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, token: turnstileToken }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || String(res.status));
      box.replaceChildren(el("p", {}, data.answer));
      if (data.sources.length) {
        box.append(el("b", {}, t("askSources")),
          el("ol", {}, ...data.sources.map((s) => el("li", { value: String(s.n) }, link(s.url, s.title, "ask", "", s.url), ` (${s.sourceName})`))));
      }
    } catch (e) {
      box.textContent = e.message || t("error");
    } finally {
      btn.disabled = false;
      // A Turnstile token is single-use.
      turnstileToken = null;
      if (turnstileId !== null) window.turnstile.reset(turnstileId);
    }
  }

  $("#day").addEventListener("change", (e) => load(e.target.value));
  $("#search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q.length >= 2) runSearch(q);
  });
  $("#clear").addEventListener("click", () => { $("#results").hidden = true; $("#q").value = ""; });
  $("#ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#ask-q").value.trim();
    if (q.length >= 5) runAsk(q);
  });

  SF.initControls();
  SF.onLang(render);
  SF.startTicker();
  load();
  loadDays();
  loadPopular();
})();
