// Story page: the detailed AI write-up for one brief story, with the publisher's image and a link to the original.
(() => {
  const { el, link, media, kicker, meta, storyHref, t } = window.SF;

  Object.assign(window.SF.TEXT.th, {
    back: "← กลับหน้าแรก", loading: "กำลังโหลด…", related: "ข่าวอื่นในหมวดนี้", points: "ประเด็นสำคัญ",
    readOriginal: (s) => `อ่านข่าวต้นฉบับที่ ${s}`, original: "ต้นฉบับ", alsoReported: (s) => `รายงานโดย: ${s}`,
    photo: (s) => `ภาพ: ${s}`, notFound: "ไม่พบข่าวนี้ อาจเก่ากว่า 14 วันแล้ว",
    basisSnippet: "สรุปจากหัวข้อและเนื้อหาย่อเท่านั้น เพราะเปิดหน้าข่าวต้นฉบับไม่ได้ อ่านรายละเอียดเพิ่มเติมที่ต้นฉบับ",
    pending: "บทสรุปแบบละเอียดของข่าวนี้ยังไม่พร้อม ตอนนี้แสดงสรุปสั้นจากฉบับเช้า",
    timeline: "ไทม์ไลน์ของข่าวนี้", first: "รายงานแรก", thisOne: "ข่าวนี้",
    footer: "สรุปโดย AI จากข่าวต้นฉบับ รูปภาพเป็นของแหล่งข่าวต้นฉบับ โปรดอ่านต้นฉบับก่อนตัดสินใจ",
  });
  Object.assign(window.SF.TEXT.en, {
    back: "← Front page", loading: "Loading…", related: "More in this section", points: "Key points",
    readOriginal: (s) => `Read the original at ${s}`, original: "Original", alsoReported: (s) => `Also reported by: ${s}`,
    photo: (s) => `Photo: ${s}`, notFound: "Story not found. It may be older than 14 days.",
    basisSnippet: "Summarised from the headline and snippet only, because the publisher's page could not be read. See the original for details.",
    pending: "The detailed write-up for this story is not ready yet. Showing the short summary from the morning brief.",
    timeline: "How this story developed", first: "First report", thisOne: "This story",
    footer: "AI summaries of the original reporting. Images belong to the original publishers. Read the original before acting on it.",
  });

  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("d") || "") ? params.get("d") : "";
  let data = null; // { detail } or { brief }
  let latest = null;
  let timeline = [];
  const $ = (s) => document.querySelector(s);

  function cveChips(cves) {
    if (!cves?.length) return null;
    return el("div", { class: "cves" }, ...cves.map((c) => {
      const a = el("a", { class: "cve", href: `https://nvd.nist.gov/vuln/detail/${c.id}`, target: "_blank", rel: "noopener noreferrer" }, c.id);
      if (c.cvss !== null) a.append(` · CVSS ${c.cvss}`);
      if (c.kevAdded) a.append(" · ", el("span", { class: "kev", title: `CISA KEV ${c.kevAdded}` }, "KEV"));
      return a;
    }));
  }

  function sourceBox(s) {
    return el("div", { class: "source-box" },
      el("p", {}, s.alsoReported?.length ? t("alsoReported", [s.sourceName, ...s.alsoReported].join(", ")) : s.sourceName),
      link(s.url, `${t("readOriginal", s.sourceName)} ↗`, "brief", s.category, s.url),
    );
  }

  function render() {
    const box = $("#story");
    if (!data) { box.replaceChildren(el("p", { class: "empty" }, t("notFound"))); return; }
    const L = SF.lang;
    const s = data.detail ?? data.brief;
    const cat = s.category;
    document.title = `${s.title[L]} · SecFin Brief`;
    const figure = el("figure", {}, media(s, cat, null), s.image ? el("figcaption", {}, t("photo", s.sourceName)) : null);

    // replaceChildren() would print "null" for optional parts, so drop them first.
    const fill = (...parts) => box.replaceChildren(...parts.filter(Boolean));
    if (data.detail) {
      const d = data.detail;
      fill(
        kicker(d, cat),
        el("h1", {}, d.title[L]),
        el("p", { class: "lede" }, d.lede[L]),
        meta(d),
        figure,
        el("section", { class: "points" }, el("h2", {}, t("points")), el("ul", {}, ...d.points[L].map((p) => el("li", {}, p)))),
        el("div", { class: "story-body" }, ...d.body[L].map((p) => el("p", {}, p))),
        el("section", { class: "callout" }, el("h2", {}, t("why")), el("p", {}, d.why[L])),
        cveChips(d.cves),
        sourceBox(d),
        d.basis === "snippet" ? el("p", { class: "note" }, t("basisSnippet")) : null,
      );
    } else {
      const b = data.brief;
      fill(
        kicker(b, cat),
        el("h1", {}, b.title[L]),
        el("p", { class: "lede" }, b.summary[L]),
        meta(b),
        figure,
        b.why ? el("section", { class: "callout" }, el("h2", {}, t("why")), el("p", {}, b.why[L])) : null,
        cveChips(b.cves),
        sourceBox(b),
        el("p", { class: "note" }, t("pending")),
      );
    }
    renderRelated(cat, s.url);
    renderTimeline(s.url);
  }

  // Every source that carried this story (same cluster), oldest first. Shown only when there is more than one.
  function renderTimeline(url) {
    const fmt = (ms) => new Date(ms).toLocaleString(SF.lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    $("#timeline").hidden = timeline.length < 2;
    $("#timeline-list").replaceChildren(...timeline.map((it, i) => el("li", { class: it.url === url ? "current" : null },
      el("time", {}, fmt(it.published)),
      el("div", {},
        el("div", { class: "meta" }, el("span", {}, it.sourceName),
          i === 0 ? el("span", { class: "chip" }, t("first")) : null,
          it.url === url ? el("span", { class: "chip" }, t("thisOne")) : null),
        link(it.url, it.title, "timeline", data?.detail?.category ?? data?.brief?.category ?? "", it.url)))));
  }

  function renderRelated(cat, url) {
    const items = (latest?.sections?.[cat] ?? []).filter((it) => it.url !== url).slice(0, 4);
    $("#related").hidden = items.length === 0;
    $("#related-list").replaceChildren(...items.map((it) =>
      el("article", { class: "row" }, media(it, cat, storyHref(it)),
        el("div", {}, kicker(it, cat), el("h4", { class: "headline" }, link(storyHref(it), it.title[SF.lang], "brief", cat, it.url)), meta(it)))));
  }

  async function load() {
    const valid = /^[0-9a-f]{64}$/.test(id);
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [story, brief, events] = await Promise.all([
      valid ? json(`/api/story/${id}${date ? `?d=${date}` : ""}`) : null,
      json(date ? `/api/brief/${date}` : "/api/brief/latest"),
      valid ? json(`/api/story/${id}/timeline`) : null,
    ]);
    data = story;
    latest = brief;
    timeline = Array.isArray(events) ? events : [];
    SF.setEdition(date);
    if (date) $(".back").href = `/?d=${date}`;
    render();
    if (story) SF.trackView("story", id, date);
  }

  SF.initControls();
  SF.onLang(render);
  SF.startTicker();
  load();
})();
