// SecFin Brief page: fetches one brief JSON and renders it. No framework, no build step.
(() => {
  const TEXT = {
    th: { finance: "การเงิน", financeTitle: "การเงิน", why: "ทำไมต้องสนใจ", empty: "ยังไม่มีข่าวในหมวดนี้", none: "ยังไม่มีสรุปข่าว ระบบจะสรุปทุกเช้า 05:30 น.", error: "โหลดข้อมูลไม่สำเร็จ", today: "ล่าสุด", footer: "สรุปโดย AI จากหัวข้อและเนื้อหาย่อของแหล่งข่าว โปรดอ่านต้นฉบับก่อนตัดสินใจ", th: "ไทย", global: "ต่างประเทศ", raw: "หัวข้อต้นฉบับ (ยังไม่ได้สรุป)", sources: (n) => `${n} แหล่งข่าว`, searchHint: "ค้นข่าวย้อนหลัง 14 วัน", clear: "ปิด", results: (q) => `ผลการค้นหา "${q}"`, noHits: "ไม่พบข่าวที่ใกล้เคียง", searching: "กำลังค้นหา…" },
    en: { finance: "Finance", financeTitle: "Finance", why: "Why it matters", empty: "No stories in this section yet", none: "No brief yet. A new one is published every morning at 05:30 Thai time.", error: "Could not load the brief", today: "Latest", footer: "AI summaries of publisher headlines and snippets. Read the original before acting on it.", th: "Thailand", global: "Global", raw: "Original headline (not summarized)", sources: (n) => `${n} sources`, searchHint: "Search the last 14 days", clear: "Close", results: (q) => `Results for "${q}"`, noHits: "No related stories found", searching: "Searching…" },
  };
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

  let lang = "th";
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "th"; } catch {}
  let brief = null;
  let loaded = false;

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) n.append(k);
    return n;
  };

  function formatDate(iso) {
    const d = new Date(`${iso}T00:00:00+07:00`);
    return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  }

  function renderItem(it) {
    const meta = el("div", { class: "meta" });
    if (it.severity) meta.append(el("span", { class: `sev ${it.severity}` }, SEV[it.severity]));
    meta.append(el("span", { class: "chip" }, TEXT[lang][it.region]), el("span", {}, it.sourceName));
    if (it.coverage > 1) meta.append(el("span", { class: "chip", title: (it.alsoReported || []).join(", ") }, TEXT[lang].sources(it.coverage)));
    const li = el("li", { class: "item" },
      el("h3", {}, el("a", { href: it.url, target: "_blank", rel: "noopener noreferrer" }, it.title[lang])),
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
      el("span", {}, new Date(h.published).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })),
    );
    return el("li", { class: "item" },
      el("h3", {}, el("a", { href: h.url, target: "_blank", rel: "noopener noreferrer" }, h.title)),
      el("p", {}, h.snippet),
      meta,
    );
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
    for (const cat of ["cyber", "it", "finance"]) {
      const list = $(`#${cat} .items`);
      list.replaceChildren();
      const items = brief?.sections?.[cat] ?? [];
      if (items.length === 0) list.append(el("li", { class: "empty" }, brief ? TEXT[lang].empty : ""));
      else items.forEach((it) => list.append(renderItem(it)));
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

  render();
  load();
  loadDays();
})();
