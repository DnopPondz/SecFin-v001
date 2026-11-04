// Shared by the front page and the story page: language, theme, DOM helpers, cards and click beacons.
(() => {
  const TEXT = {
    th: {
      cyber: "Cyber Security", it: "IT", finance: "การเงิน", disaster: "อากาศและภัยพิบัติ",
      tagline: "สรุปข่าว IT · Cyber · การเงิน · อากาศ ไทยและโลก ทุกเช้า 05:30 น.",
      th: "ไทย", global: "ต่างประเทศ", north: "ภาคเหนือ", sources: (n) => `${n} แหล่งข่าว`,
      why: "ทำไมต้องสนใจ", raw: "หัวข้อต้นฉบับ (ยังไม่ได้สรุป)", live: "ล่าสุด", error: "โหลดข้อมูลไม่สำเร็จ",
      ago: (m) => (m < 60 ? `${Math.max(1, m)} นาทีที่แล้ว` : m < 1440 ? `${Math.floor(m / 60)} ชม. ที่แล้ว` : `${Math.floor(m / 1440)} วันที่แล้ว`),
      theme: "สลับโหมดสว่าง/มืด", lang: "EN", watchTip: "ตรงกับ watchlist", settings: "ตั้งค่า",
    },
    en: {
      cyber: "Cyber Security", it: "IT", finance: "Finance", disaster: "Weather & Disasters",
      tagline: "IT · Cyber · Finance · Weather, Thailand and the world, every morning at 05:30",
      th: "Thailand", global: "Global", north: "Northern Thailand", sources: (n) => `${n} sources`,
      why: "Why it matters", raw: "Original headline (not summarized)", live: "Live", error: "Could not load",
      ago: (m) => (m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`),
      theme: "Toggle light/dark mode", lang: "ไทย", watchTip: "On your watchlist", settings: "Settings",
    },
  };
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  let lang = store.get("lang") === "en" ? "en" : "th";
  const listeners = [];

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
    for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k);
    return n;
  };

  const t = (key, ...args) => {
    const v = TEXT[lang][key];
    return typeof v === "function" ? v(...args) : v ?? key;
  };

  // Internal story page when the story has an id; the publisher's page otherwise (older briefs).
  // An archived edition adds &d= so the story page can fall back to that day's summary.
  // /story, not /story.html: static assets redirect .html paths, which costs a round trip.
  let edition = null;
  const storyHref = (it) => (it.id ? `/story?id=${it.id}${edition ? `&d=${edition}` : ""}` : it.url);
  // data-url carries the publisher URL so click counts match stored articles.
  const link = (href, text, kind, cat, url) => {
    const external = /^https?:/.test(href);
    return el("a", { href, target: external ? "_blank" : null, rel: external ? "noopener noreferrer" : null, "data-kind": kind, "data-cat": cat, "data-url": url || href }, text);
  };

  const timeAgo = (ms) => (ms ? t("ago", Math.round((Date.now() - ms) / 60000)) : "");

  // Publisher images load straight from their servers, without a referrer; a broken one falls back to a placeholder.
  function media(it, cat, href, cls = "media") {
    const box = el(href ? "a" : "div", href ? { class: cls, href, "data-kind": "brief", "data-cat": cat, "data-url": it.url, "aria-hidden": "true", tabindex: "-1" } : { class: cls });
    const ph = el("div", { class: "ph" }, t(cat) || "SecFin");
    if (it.image) {
      const img = el("img", { src: it.image, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => img.replaceWith(ph));
      box.append(img);
    } else box.append(ph);
    return box;
  }

  function kicker(it, cat) {
    return el("div", { class: "kicker" }, t(cat), it.severity ? el("span", { class: `sev ${it.severity}` }, SEV[it.severity]) : null);
  }

  function meta(it) {
    return el("div", { class: "meta" },
      el("span", {}, it.sourceName),
      it.published ? el("span", {}, timeAgo(it.published)) : null,
      it.north ? el("span", { class: "chip north" }, t("north")) : null,
      ...(it.watch || []).map((w) => el("span", { class: "chip watch", title: t("watchTip") }, `★ ${w}`)),
      it.coverage > 1 ? el("span", { class: "chip", title: (it.alsoReported || []).join(", ") }, t("sources", it.coverage)) : null,
      el("span", { class: "chip" }, t(it.region)),
    );
  }

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  const currentTheme = () =>
    document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function initControls() {
    const themeBtn = document.querySelector("#theme");
    const langBtn = document.querySelector("#lang");
    const paint = () => {
      themeBtn.innerHTML = currentTheme() === "dark" ? SUN : MOON;
      themeBtn.title = themeBtn.ariaLabel = t("theme");
      langBtn.textContent = t("lang");
      document.documentElement.lang = lang;
      document.querySelectorAll("[data-t]").forEach((n) => { n.textContent = t(n.dataset.t); });
    };
    themeBtn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      store.set("theme", next);
      paint();
    });
    langBtn.addEventListener("click", () => {
      lang = lang === "th" ? "en" : "th";
      store.set("lang", lang);
      paint();
      listeners.forEach((fn) => fn(lang));
    });
    paint();
    const today = document.querySelector("#today");
    if (today) {
      const draw = () => { today.textContent = new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }); };
      draw();
      listeners.push(draw);
    }
  }

  const TICKER_PX_PER_SECOND = 38;
  const ROTATE_MS = 5000;
  const HOLD_AFTER_TOUCH_MS = 8000;

  // Live ticker from the LiveFeed Durable Object. Wide screens: the headlines scroll on their own;
  // the list is rendered twice and the track slides by half its width, so the loop has no seam.
  // Phones: one headline at a time slides up to the next every few seconds, which stays readable
  // on a narrow screen. Hover, focus or a touch holds the current headline.
  function startTicker() {
    const box = document.querySelector("#ticker");
    const list = document.querySelector("#ticker-list");
    if (!box || !list) return;
    const viewport = el("div", { class: "ticker-viewport" });
    list.replaceWith(viewport);
    viewport.append(list);
    const narrow = matchMedia("(max-width: 640px)");
    let items = [];
    let delay = 2000;
    let index = 0;
    let timer = null;
    let heldUntil = 0;

    const item = (it, copy) => {
      const a = link(it.url, "", "ticker", it.category, it.url);
      a.append(el("span", { class: "tk-src" }, it.sourceName), el("span", { class: "tk-title" }, it.title));
      // Loop copies and hidden rotator items stay out of tab order and screen readers.
      if (copy) a.tabIndex = -1;
      return el("li", { class: it.fresh ? "fresh" : null, "aria-hidden": copy ? "true" : null }, a);
    };

    const drawMarquee = () => {
      box.classList.remove("rotate");
      list.replaceChildren(...items.map((it) => item(it, false)), ...items.map((it) => item(it, true)));
      // Constant speed whatever the number of headlines; restart so new items start from the left.
      requestAnimationFrame(() => {
        list.style.setProperty("--ticker-duration", `${Math.max(25, list.scrollWidth / 2 / TICKER_PX_PER_SECOND)}s`);
        list.style.animation = "none";
        void list.offsetWidth;
        list.style.animation = "";
      });
    };

    const drawRotate = () => {
      box.classList.add("rotate");
      list.style.animation = "none";
      index = Math.min(index, items.length - 1);
      list.replaceChildren(...items.map((it, i) => {
        const li = item(it, i !== index);
        if (i === index) li.classList.add("current");
        return li;
      }));
    };

    const step = () => {
      const lis = list.children;
      if (lis.length < 2) return;
      const prev = lis[index];
      prev.classList.remove("current");
      prev.classList.add("leaving");
      prev.setAttribute("aria-hidden", "true");
      prev.querySelector("a").tabIndex = -1;
      setTimeout(() => prev.classList.remove("leaving"), 600);
      index = (index + 1) % lis.length;
      const next = lis[index];
      next.classList.add("current");
      next.removeAttribute("aria-hidden");
      next.querySelector("a").removeAttribute("tabindex");
    };

    const schedule = () => {
      clearInterval(timer);
      if (!narrow.matches || items.length < 2) return;
      timer = setInterval(() => {
        if (document.hidden || Date.now() < heldUntil || box.matches(":hover, :focus-within")) return;
        step();
      }, ROTATE_MS);
    };

    const draw = () => {
      box.hidden = items.length === 0;
      if (items.length === 0) return;
      if (narrow.matches) drawRotate();
      else drawMarquee();
      schedule();
    };

    box.addEventListener("touchstart", () => { heldUntil = Date.now() + HOLD_AFTER_TOUCH_MS; }, { passive: true });
    narrow.addEventListener("change", draw);

    const show = (incoming, fresh) => {
      const seen = new Set(incoming.map((it) => it.url));
      items = [...incoming.map((it) => ({ ...it, fresh })), ...items.filter((it) => !seen.has(it.url))].slice(0, 15);
      // New headlines go to the front; the rotator starts again from the newest.
      if (fresh) index = 0;
      draw();
    };
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      let ping;
      ws.onopen = () => { delay = 2000; ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 50000); };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "recent") { items = []; show(msg.items.slice(0, 15), false); }
          if (msg.type === "new") show(msg.items, true);
        } catch {}
      };
      ws.onclose = () => { clearInterval(ping); setTimeout(connect, delay); delay = Math.min(delay * 2, 60000); };
    };
    connect();
  }

  // One listener reports clicks on tracked links to Analytics Engine.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[data-kind]");
    if (!a) return;
    const body = JSON.stringify({ url: a.dataset.url || a.href, kind: a.dataset.kind, category: a.dataset.cat });
    try { navigator.sendBeacon("/api/click", new Blob([body], { type: "application/json" })); } catch {}
  });

  // Page-view beacon for the owner's /adms dashboard. The visitor id is random and replaced every
  // Thai day, so visits cannot be linked across days. Do Not Track and Global Privacy Control are honoured.
  function trackView(page, id, edition) {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    let vid = null;
    try {
      const saved = JSON.parse(localStorage.getItem("vid") || "null");
      vid = saved && saved.day === day ? saved.id : null;
      if (!vid) {
        vid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
        localStorage.setItem("vid", JSON.stringify({ day, id: vid }));
      }
    } catch {}
    const body = JSON.stringify({ page, id: id || "", edition: edition || "", ref: document.referrer, lang, vid: vid || "" });
    try { navigator.sendBeacon("/api/view", new Blob([body], { type: "application/json" })); } catch {}
  }

  // Installable app and offline reading (public/sw.js). Pages work the same without it.
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  // Ask the service worker to keep these API responses for offline reading.
  function precache(urls) {
    navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "precache", urls })).catch(() => {});
  }

  window.SF = {
    TEXT, t, el, link, media, kicker, meta, storyHref, timeAgo, store, initControls, startTicker, precache, trackView,
    get lang() { return lang; },
    onLang(fn) { listeners.push(fn); },
    setEdition(date) { edition = date || null; },
  };
})();
