// /sources: every feed the brief reads, its type and caution note, and how stories are summarised.
(() => {
  const { el, t } = window.SF;

  Object.assign(window.SF.TEXT.th, {
    back: "← กลับหน้าแรก", sourcesTitle: "แหล่งข่าวและวิธีสรุป", howTitle: "เราสรุปข่าวอย่างไร", tiersTitle: "ประเภทแหล่งข่าว",
    missingTitle: "แหล่งทางการที่ยังไม่มี",
    missingText: "ยังไม่มี feed ที่ใช้งานได้จาก ปภ., ธนาคารแห่งประเทศไทย (ยกเลิก RSS ตั้งแต่ 28 เม.ย. 2566) และตลาดหลักทรัพย์ฯ (ตรวจล่าสุด 4 พ.ย. 2569) ข่าวจากหน่วยงานเหล่านี้ยังเข้ามาทางสื่อที่รายงานต่อ จะเพิ่มเมื่อมี feed ที่ใช้ได้ ส่วน สกมช. ใช้ feed ของ ThaiCERT ซึ่งเป็นศูนย์รับแจ้งเหตุของ สกมช. และประกาศเตือนภัยของกรมอุตุนิยมวิทยาใช้ feed CAP ของกรมฯ",
    how: [
      "ดึงหัวข่าวและเนื้อหาย่อจากแหล่งข่าวด้านล่างทุกชั่วโมง ไม่เก็บเนื้อข่าวเต็ม",
      "ข่าวเรื่องเดียวกันจากหลายแหล่งถูกรวมเป็นเรื่องเดียว และลิงก์ไปที่แหล่งที่น่าเชื่อถือที่สุด (ทางการ > สื่อหลัก > เฉพาะทาง)",
      "ทุกเช้า 05:30 น. AI (Gemma 4 บน Cloudflare Workers AI) เลือก 5 ข่าวต่อหมวด และแต่ละหมวดมีทั้งข่าวไทยและต่างประเทศ ยกเว้นหมวดอากาศที่ให้ความสำคัญกับภาคเหนือก่อน",
      "เวลา 12:00 น. มีอัปเดตรอบเที่ยงเฉพาะหมวดการเงิน คัดจากข่าวที่ออกหลังบรีฟเช้าและยังไม่อยู่ในบรีฟเช้า",
      "AI สรุปจากเนื้อข่าวต้นฉบับเท่านั้น และถูกสั่งห้ามเพิ่มตัวเลข ชื่อ หรือข้อเท็จจริงที่ไม่มีในต้นฉบับ ลิงก์ทุกอันผูกกับข่าวจริง AI สร้างลิงก์เองไม่ได้",
      "เลข CVE คะแนน CVSS และสถานะ CISA KEV ดึงจากฐานข้อมูล NVD โดยตรง ไม่ได้ให้ AI เขียน",
      "กรองบทความที่ระบุว่าเป็น sponsored หรือประชาสัมพันธ์ และบทแนะนำซื้อขายหุ้นออก",
      "AI ผิดพลาดได้ ถ้าพบข่าวที่สรุปผิด กด \"แจ้งข่าวผิด\" ที่หน้าข่าวนั้น และควรอ่านต้นฉบับก่อนตัดสินใจทุกครั้ง",
    ],
    colSource: "แหล่งข่าว", colType: "ประเภท", colRegion: "ภูมิภาค", colLang: "ภาษา", colNote: "หมายเหตุ",
    th: "ไทย", global: "ต่างประเทศ", langTh: "ไทย", langEn: "อังกฤษ",
    panelsTitle: "แหล่งข้อมูลแผงข้าง", panelsHelp: "ตัวเลขในแผงข้างหน้าแรกดึงตรงจากแหล่งด้านล่าง ไม่ผ่าน AI ถ้าแหล่งใดดึงไม่ได้ จะแสดงค่าล่าสุดที่มีอยู่",
    colData: "ข้อมูล", colFrom: "แหล่ง", colEvery: "ความถี่และข้อควรรู้",
  });
  Object.assign(window.SF.TEXT.en, {
    back: "← Front page", sourcesTitle: "Sources and how we summarise", howTitle: "How stories are summarised", tiersTitle: "Source types",
    missingTitle: "Official sources not yet included",
    missingText: "No usable feed yet from the Department of Disaster Prevention and Mitigation, the Bank of Thailand (its RSS ended on 28 April 2023) or the Stock Exchange of Thailand (last checked 4 Nov 2026). Their news still arrives through outlets that report it, and they will be added when a working feed exists. NCSA is covered by ThaiCERT, its incident response centre, and Thai Meteorological Department warnings come from the department's CAP feed.",
    how: [
      "Headlines and short snippets are fetched from the sources below every hour. Full articles are never stored.",
      "The same story from several sources is merged into one, linked to the most credible source (official > mainstream > specialist).",
      "Every morning at 05:30 Thai time an AI model (Gemma 4 on Cloudflare Workers AI) picks 5 stories per section, mixing Thai and world news in every section except weather, which puts Northern Thailand first.",
      "At 12:00 a midday update adds finance stories published after the morning brief that it did not already carry.",
      "The model summarises only from the original article and is told not to add numbers, names or facts that are not in it. Every link points to a real article; the model cannot create links.",
      "CVE ids, CVSS scores and CISA KEV status come straight from the NVD database, not from the model.",
      "Articles marked as sponsored or press releases, and stock buy/sell tips, are filtered out.",
      "AI can make mistakes. Use \"Report a mistake\" on any story page, and read the original before acting on it.",
    ],
    colSource: "Source", colType: "Type", colRegion: "Region", colLang: "Language", colNote: "Note",
    th: "Thailand", global: "Global", langTh: "Thai", langEn: "English",
    panelsTitle: "Side panel data", panelsHelp: "The numbers in the front page's side panels come straight from the sources below, with no AI. When a source fails, the last value it gave stays on the page.",
    colData: "Data", colFrom: "Source", colEvery: "Frequency and caveats",
  });

  const $ = (s) => document.querySelector(s);
  const CATS = ["cyber", "it", "finance", "disaster"];

  // Mirrors the sources described at the top of src/widgets.ts.
  const PANELS = [
    { data: { th: "ฝุ่น PM2.5 ภาคเหนือ", en: "PM2.5, Northern Thailand" }, from: "กรมควบคุมมลพิษ (Air4Thai) ผ่าน OpenAQ", site: "https://explore.openaq.org",
      note: { th: "ทุกชั่วโมง ค่าเฉลี่ย 24 ชม. จากสถานีในอำเภอเมืองของแต่ละจังหวัด จังหวัดที่สถานีไม่มีข้อมูลใช้ค่าประมาณจากแบบจำลอง CAMS (Open-Meteo) และมีเครื่องหมาย ≈", en: "Hourly. 24 h mean from the station in each provincial capital. A province whose station has no data shows a CAMS model estimate (Open-Meteo), marked ≈." } },
    { data: { th: "ค่าเงิน USD, EUR, JPY", en: "USD, EUR, JPY rates" }, from: "ECB ผ่าน Frankfurter", site: "https://frankfurter.dev",
      note: { th: "อัตราอ้างอิงของธนาคารกลางยุโรป ออกเฉพาะวันทำการ ไม่ใช่เรตซื้อขายของธนาคารไทย", en: "European Central Bank reference rates, working days only; not a Thai bank's buying or selling rate." } },
    { data: { th: "ทองคำ", en: "Gold" }, from: "gold-api.com", site: "https://gold-api.com",
      note: { th: "ราคา spot ต่อออนซ์ ราคาต่อบาททองคำเป็นค่าประมาณจาก spot และค่าเงิน ไม่ใช่ราคาสมาคมค้าทองคำ", en: "Spot price per ounce. The per baht-weight price is estimated from spot and the exchange rate, not the Gold Traders Association price." } },
    { data: { th: "บิตคอยน์", en: "Bitcoin" }, from: "CoinGecko", site: "https://www.coingecko.com",
      note: { th: "ทุกชั่วโมง พร้อมการเปลี่ยนแปลง 24 ชม.", en: "Hourly, with the 24 h change." } },
    { data: { th: "น้ำมันดิบ Brent, WTI", en: "Brent and WTI crude" }, from: "U.S. EIA", site: "https://www.eia.gov",
      note: { th: "ราคา spot ทุก 6 ชั่วโมง ข้อมูลช้ากว่าตลาดประมาณ 1 สัปดาห์", en: "Spot prices, every 6 hours; about a week behind the market." } },
    { data: { th: "ราคาน้ำมันขายปลีก", en: "Thai pump prices" }, from: "PTT OR", site: "https://www.pttor.com",
      note: { th: "ทุก 3 ชั่วโมง ราคาในกรุงเทพฯ ต่างจังหวัดอาจสูงกว่าเล็กน้อย", en: "Every 3 hours. Bangkok prices; provinces may be slightly higher." } },
  ];

  function renderPanels() {
    const L = SF.lang;
    $("#panels").replaceChildren(
      el("h2", {}, t("panelsTitle")),
      el("p", { class: "note" }, t("panelsHelp")),
      el("div", { class: "table-wrap" }, el("table", { class: "adms-table" },
        el("thead", {}, el("tr", {}, ...[t("colData"), t("colFrom"), t("colEvery")].map((h) => el("th", {}, h)))),
        el("tbody", {}, ...PANELS.map((p) => el("tr", {},
          el("td", {}, p.data[L]),
          el("td", {}, el("a", { href: p.site, target: "_blank", rel: "noopener noreferrer" }, p.from)),
          el("td", { class: "note-cell" }, p.note[L])))))),
    );
  }

  function render() {
    $("#how").replaceChildren(...t("how").map((s) => el("li", {}, s)));
    $("#tiers").replaceChildren(...["official", "mainstream", "specialist"].flatMap((tier) => [
      el("dt", {}, el("span", { class: `chip tier ${tier}` }, t(`tier_${tier}`))),
      el("dd", {}, t(`tierHelp_${tier}`)),
    ]));
    const list = Object.values(SF.sources);
    $("#list").replaceChildren(...CATS.map((cat) => {
      const rows = list.filter((s) => s.category === cat);
      return el("div", { class: "source-group" },
        el("h2", {}, t(cat)),
        el("div", { class: "table-wrap" }, el("table", { class: "adms-table" },
          el("thead", {}, el("tr", {}, ...[t("colSource"), t("colType"), t("colRegion"), t("colLang"), t("colNote")].map((h) => el("th", {}, h)))),
          el("tbody", {}, ...rows.map((s) => el("tr", {},
            el("td", {}, el("a", { href: s.site, target: "_blank", rel: "noopener noreferrer" }, s.name)),
            el("td", {}, SF.tierChip(s.id)),
            el("td", {}, t(s.region)),
            el("td", {}, s.lang === "en" ? t("langEn") : t("langTh")),
            el("td", { class: "note-cell" }, s.note ? s.note[SF.lang] : "–")))))));
    }));
  }

  SF.initControls();
  SF.onLang(render);
  SF.onLang(renderPanels);
  SF.sourcesReady.then(render);
  renderPanels();
})();
