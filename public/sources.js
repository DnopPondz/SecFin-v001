// /sources: every feed the brief reads, its type and caution note, and how stories are summarised.
(() => {
  const { el, t } = window.SF;

  Object.assign(window.SF.TEXT.th, {
    back: "← กลับหน้าแรก", sourcesTitle: "แหล่งข่าวและวิธีสรุป", howTitle: "เราสรุปข่าวอย่างไร", tiersTitle: "ประเภทแหล่งข่าว",
    missingTitle: "แหล่งทางการที่ยังไม่มี",
    missingText: "ยังไม่มี feed ที่ใช้งานได้จาก สกมช., ปภ., ธนาคารแห่งประเทศไทย, ตลาดหลักทรัพย์ฯ และประกาศเตือนภัยอากาศของกรมอุตุนิยมวิทยา (ตรวจล่าสุด 4 พ.ย. 2569) จะเพิ่มเมื่อมี feed ที่ใช้ได้",
    how: [
      "ดึงหัวข่าวและเนื้อหาย่อจากแหล่งข่าวด้านล่างทุกชั่วโมง ไม่เก็บเนื้อข่าวเต็ม",
      "ข่าวเรื่องเดียวกันจากหลายแหล่งถูกรวมเป็นเรื่องเดียว และลิงก์ไปที่แหล่งที่น่าเชื่อถือที่สุด (ทางการ > สื่อหลัก > เฉพาะทาง)",
      "ทุกเช้า 05:30 น. AI (Gemma 4 บน Cloudflare Workers AI) เลือก 5 ข่าวต่อหมวด และแต่ละหมวดมีทั้งข่าวไทยและต่างประเทศ ยกเว้นหมวดอากาศที่ให้ความสำคัญกับภาคเหนือก่อน",
      "AI สรุปจากเนื้อข่าวต้นฉบับเท่านั้น และถูกสั่งห้ามเพิ่มตัวเลข ชื่อ หรือข้อเท็จจริงที่ไม่มีในต้นฉบับ ลิงก์ทุกอันผูกกับข่าวจริง AI สร้างลิงก์เองไม่ได้",
      "เลข CVE คะแนน CVSS และสถานะ CISA KEV ดึงจากฐานข้อมูล NVD โดยตรง ไม่ได้ให้ AI เขียน",
      "กรองบทความที่ระบุว่าเป็น sponsored หรือประชาสัมพันธ์ และบทแนะนำซื้อขายหุ้นออก",
      "AI ผิดพลาดได้ ถ้าพบข่าวที่สรุปผิด กด \"แจ้งข่าวผิด\" ที่หน้าข่าวนั้น และควรอ่านต้นฉบับก่อนตัดสินใจทุกครั้ง",
    ],
    colSource: "แหล่งข่าว", colType: "ประเภท", colRegion: "ภูมิภาค", colLang: "ภาษา", colNote: "หมายเหตุ",
    th: "ไทย", global: "ต่างประเทศ", langTh: "ไทย", langEn: "อังกฤษ",
  });
  Object.assign(window.SF.TEXT.en, {
    back: "← Front page", sourcesTitle: "Sources and how we summarise", howTitle: "How stories are summarised", tiersTitle: "Source types",
    missingTitle: "Official sources not yet included",
    missingText: "No usable feed yet from Thailand's NCSA, the Department of Disaster Prevention and Mitigation, the Bank of Thailand, the Stock Exchange of Thailand, or the Thai Meteorological Department's weather warnings (last checked 4 Nov 2026). They will be added when a working feed exists.",
    how: [
      "Headlines and short snippets are fetched from the sources below every hour. Full articles are never stored.",
      "The same story from several sources is merged into one, linked to the most credible source (official > mainstream > specialist).",
      "Every morning at 05:30 Thai time an AI model (Gemma 4 on Cloudflare Workers AI) picks 5 stories per section, mixing Thai and world news in every section except weather, which puts Northern Thailand first.",
      "The model summarises only from the original article and is told not to add numbers, names or facts that are not in it. Every link points to a real article; the model cannot create links.",
      "CVE ids, CVSS scores and CISA KEV status come straight from the NVD database, not from the model.",
      "Articles marked as sponsored or press releases, and stock buy/sell tips, are filtered out.",
      "AI can make mistakes. Use \"Report a mistake\" on any story page, and read the original before acting on it.",
    ],
    colSource: "Source", colType: "Type", colRegion: "Region", colLang: "Language", colNote: "Note",
    th: "Thailand", global: "Global", langTh: "Thai", langEn: "English",
  });

  const $ = (s) => document.querySelector(s);
  const CATS = ["cyber", "it", "finance", "disaster"];

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
  SF.sourcesReady.then(render);
})();
