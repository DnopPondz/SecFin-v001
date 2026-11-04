// Owner settings: watchlist and the health report.
// Every call sends the admin key; the Worker answers 404 to a wrong key.
(() => {
  const { el, t } = window.SF;

  Object.assign(window.SF.TEXT.th, {
    back: "← กลับหน้าแรก", keyLabel: "Admin key", unlock: "เปิด", keyHint: "เก็บไว้ในแท็บนี้เท่านั้น ปิดแท็บแล้วต้องใส่ใหม่",
    badKey: "รหัสไม่ถูกต้อง", watchTitle: "Watchlist",
    watchHelp: "หนึ่งคำต่อบรรทัด เช่น vendor, ผลิตภัณฑ์ หรือบริษัท คำภาษาอังกฤษจับทั้งคำ ไม่สนตัวพิมพ์ ข่าวที่ตรงจะถูกดันขึ้นในบรีฟและติดป้าย ★ คำเหล่านี้จะปรากฏบนหน้าเว็บที่เปิดสาธารณะ",
    save: "บันทึก", saving: "กำลังบันทึก…",
    saved: (n, r) => `บันทึกแล้ว ${n} คำ ติดป้ายข่าว 72 ชม. ล่าสุดใหม่ ${r} ข่าว`,
    healthTitle: "สถานะระบบ", healthHelp: "สิ่งที่ต้องตรวจสอบตอนนี้: บรีฟ, บทสรุปละเอียด, feed และโควตา Neuron", recheck: "ตรวจอีกครั้ง",
    healthy: "ไม่พบปัญหา", neurons: (u, b) => `Neuron วันนี้ (UTC) ${u} จาก ${b}`,
  });
  Object.assign(window.SF.TEXT.en, {
    back: "← Front page", keyLabel: "Admin key", unlock: "Unlock", keyHint: "Kept in this tab only; you will need it again after closing the tab.",
    badKey: "Wrong key", watchTitle: "Watchlist",
    watchHelp: "One term per line: vendors, products or companies. English terms match whole words, any case. Matching stories rank higher in the brief and get a ★ tag. These terms appear on the public pages.",
    save: "Save", saving: "Saving…",
    saved: (n, r) => `Saved ${n} terms, re-tagged ${r} stories from the last 72 h`,
    healthTitle: "System status", healthHelp: "What needs attention now: the brief, write-ups, feeds and the Neuron quota", recheck: "Check again",
    healthy: "No problems found", neurons: (u, b) => `Neurons today (UTC) ${u} of ${b}`,
  });

  const $ = (s) => document.querySelector(s);
  let key = "";
  try { key = sessionStorage.getItem("adminKey") || ""; } catch {}
  let state = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { "x-admin-key": key, "content-type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 404) throw new Error(t("badKey"));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || String(res.status));
    return data;
  }

  function render() {
    if (state) $("#watch").value = state.settings.watch.join("\n");
  }

  async function loadHealth() {
    const box = $("#health");
    box.replaceChildren(el("p", { class: "status" }, "…"));
    try {
      const [{ problems }, status] = await Promise.all([api("/api/admin/health"), api("/api/admin/status")]);
      box.replaceChildren(
        el("p", { class: "status" }, t("neurons", Math.round(status.neuronsToday), status.budget)),
        problems.length ? el("ul", {}, ...problems.map((p) => el("li", {}, p))) : el("p", {}, t("healthy")),
      );
    } catch (e) {
      box.replaceChildren(el("p", { class: "status" }, e.message));
    }
  }

  async function unlock() {
    try {
      state = await api("/api/admin/settings");
      try { sessionStorage.setItem("adminKey", key); } catch {}
      $("#panels").hidden = false;
      $("#key-status").textContent = "";
      render();
      loadHealth();
    } catch (e) {
      $("#panels").hidden = true;
      $("#key-status").textContent = e.message;
    }
  }

  $("#key-form").addEventListener("submit", (e) => {
    e.preventDefault();
    key = $("#key").value.trim();
    unlock();
  });

  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#save-status");
    status.textContent = t("saving");
    try {
      const out = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ watch: $("#watch").value.split("\n") }),
      });
      state.settings = out.settings;
      render();
      status.textContent = t("saved", out.settings.watch.length, out.retagged);
    } catch (err) {
      status.textContent = err.message;
    }
  });

  $("#health-btn").addEventListener("click", loadHealth);

  SF.initControls();
  SF.onLang(render);
  if (key) unlock();
})();
