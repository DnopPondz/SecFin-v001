// Floating "ask the news" chat on every reader page. Each question goes to /api/ask on its own
// (the API keeps no conversation state); the transcript lives in sessionStorage so it follows the
// reader from page to page within the tab. Turnstile loads only when the chat is first opened.
(() => {
  const { el, link, t } = window.SF;
  const TURNSTILE_SITE_KEY = "0x4AAAAAAFxqSKUj6BrChqz1"; // public by design; the secret is a Worker secret
  const KEEP = 40;
  const OPEN_MS = 520;
  const CLOSE_MS = 260;

  Object.assign(window.SF.TEXT.th, {
    chatOpen: "ถามข่าวกับ AI", chatClose: "ปิดแชต", chatTitle: "ถามข่าว", chatSub: "ตอบจากข่าว 14 วันล่าสุด พร้อมแหล่งที่มา",
    chatHello: "สวัสดีครับ ถามเรื่องข่าว IT, Cyber, การเงิน หรืออากาศ ในช่วง 14 วันที่ผ่านมาได้เลย ผมจะตอบจากข่าวในคลังและบอกแหล่งที่มา",
    chatNote: "แต่ละคำถามตอบแยกกัน ยังไม่จำคำถามก่อนหน้า",
    chatPlaceholder: "พิมพ์คำถาม…", chatSend: "ส่ง", chatClear: "ล้างแชต", chatSources: "แหล่งที่มา",
    chatChecking: "กำลังยืนยันว่าไม่ใช่บอท…", chatShort: "คำถามต้องยาว 5 ถึง 300 ตัวอักษร",
    chatTry: ["มีช่องโหว่อะไรที่ต้องรีบแพตช์บ้าง", "สรุปข่าวเศรษฐกิจไทยสัปดาห์นี้", "ภาคเหนือมีเรื่องอากาศหรือภัยพิบัติอะไรบ้าง"],
  });
  Object.assign(window.SF.TEXT.en, {
    chatOpen: "Ask the news", chatClose: "Close chat", chatTitle: "Ask the news", chatSub: "Answers from the last 14 days, with sources",
    chatHello: "Hi. Ask about IT, cyber, finance or weather news from the last 14 days. I answer from stored stories and list my sources.",
    chatNote: "Each question is answered on its own; earlier questions are not remembered.",
    chatPlaceholder: "Type a question…", chatSend: "Send", chatClear: "Clear chat", chatSources: "Sources",
    chatChecking: "Checking you are not a bot…", chatShort: "Questions must be 5 to 300 characters",
    chatTry: ["Which vulnerabilities need patching first?", "Summarise this week's Thai economy news", "Any weather or disaster news in Northern Thailand?"],
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const store = {
    load() { try { return JSON.parse(sessionStorage.getItem("chat") || "[]"); } catch { return []; } },
    save(list) { try { sessionStorage.setItem("chat", JSON.stringify(list.slice(-KEEP))); } catch {} },
  };
  let messages = store.load();
  let open = false;
  let busy = false;
  let closeTimer = null;

  const CHAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20.5l1.4-4.6A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SEND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

  // Markup
  const fab = el("button", { class: "chat-fab", type: "button", "aria-expanded": "false", "aria-controls": "chat-panel" });
  // Two layers: the button floats, the body inside it pops, so the two motions never share a transform.
  fab.innerHTML = `<span class="chat-fab-body"><span class="chat-fab-icon chat-fab-chat">${CHAT_ICON}</span><span class="chat-fab-icon chat-fab-close">${CLOSE_ICON}</span></span>`;
  const title = el("h2", { id: "chat-title" });
  const sub = el("p", { class: "chat-sub" });
  const clearBtn = el("button", { class: "chat-clear", type: "button" });
  const log = el("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const check = el("div", { class: "chat-check", id: "chat-turnstile" });
  const input = el("textarea", { class: "chat-input", rows: "1", maxlength: "300", id: "chat-input" });
  const send = el("button", { class: "chat-send", type: "submit" });
  send.innerHTML = SEND_ICON;
  const form = el("form", { class: "chat-form" }, input, send);
  const panel = el("section", { class: "chat-panel", id: "chat-panel", role: "dialog", "aria-labelledby": "chat-title", hidden: "" },
    el("header", { class: "chat-head" }, el("div", { class: "chat-avatar", "aria-hidden": "true" }), el("div", { class: "chat-head-text" }, title, sub), clearBtn),
    log, check, form);
  document.body.append(panel, fab);

  // Turnstile: one single-use token per question. Questions wait for the next token if needed.
  let turnstileId = null;
  let token = null;
  let waiters = [];
  function loadTurnstile() {
    if (window.turnstile || document.querySelector("script[data-turnstile]")) return;
    window.onChatTurnstile = () => {
      turnstileId = window.turnstile.render("#chat-turnstile", {
        sitekey: TURNSTILE_SITE_KEY,
        language: SF.lang,
        size: "flexible",
        appearance: "interaction-only",
        callback: (tok) => { token = tok; waiters.splice(0).forEach((w) => w(tok)); },
        "expired-callback": () => { token = null; },
        "error-callback": () => { token = null; },
      });
    };
    document.head.append(el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onChatTurnstile", async: "", defer: "", "data-turnstile": "" }));
  }
  const nextToken = () => (token ? Promise.resolve(token) : new Promise((resolve) => waiters.push(resolve)));
  function useToken() {
    token = null;
    if (turnstileId !== null) window.turnstile.reset(turnstileId);
  }

  // Rendering
  function bubble(m, animate) {
    const node = el("div", { class: `chat-msg ${m.role}${m.error ? " error" : ""}${animate ? " pop" : ""}` }, el("p", {}, m.text));
    if (m.sources?.length) {
      node.append(el("div", { class: "chat-sources" }, el("b", {}, t("chatSources")),
        el("ol", {}, ...m.sources.map((s) => el("li", { value: String(s.n) }, link(s.url, s.title, "ask", "", s.url), el("span", {}, ` · ${s.sourceName}`))))));
    }
    return node;
  }

  function greeting() {
    const chips = el("div", { class: "chat-chips" }, ...t("chatTry").map((q, i) =>
      el("button", { type: "button", class: "chat-chip", style: `--i:${i}` }, q)));
    chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chat-chip");
      if (b) ask(b.textContent);
    });
    return [el("div", { class: "chat-msg bot hello" }, el("p", {}, t("chatHello")), el("p", { class: "chat-note" }, t("chatNote"))), messages.length ? null : chips];
  }

  function renderAll() {
    title.textContent = t("chatTitle");
    sub.textContent = t("chatSub");
    clearBtn.textContent = t("chatClear");
    clearBtn.hidden = messages.length === 0;
    input.placeholder = t("chatPlaceholder");
    send.setAttribute("aria-label", t("chatSend"));
    fab.setAttribute("aria-label", open ? t("chatClose") : t("chatOpen"));
    log.replaceChildren(...greeting().filter(Boolean), ...messages.map((m) => bubble(m, false)));
    log.scrollTop = log.scrollHeight;
  }

  function push(m) {
    messages.push(m);
    store.save(messages);
    log.querySelector(".chat-chips")?.remove();
    clearBtn.hidden = false;
    log.append(bubble(m, true));
    log.scrollTo({ top: log.scrollHeight, behavior: reduced.matches ? "auto" : "smooth" });
  }

  function typing() {
    const node = el("div", { class: "chat-msg bot typing pop", "aria-label": "…" }, el("span"), el("span"), el("span"));
    log.append(node);
    log.scrollTo({ top: log.scrollHeight, behavior: reduced.matches ? "auto" : "smooth" });
    return node;
  }

  async function ask(q) {
    q = q.trim();
    if (busy) return;
    if (q.length < 5 || q.length > 300) { push({ role: "bot", text: t("chatShort"), error: true }); return; }
    busy = true;
    send.disabled = true;
    input.value = "";
    autosize();
    push({ role: "user", text: q });
    const dots = typing();
    try {
      loadTurnstile();
      const slow = setTimeout(() => { if (!token) dots.dataset.label = t("chatChecking"); }, 1500);
      const tok = await nextToken();
      clearTimeout(slow);
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, token: tok }) });
      useToken();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("error"));
      dots.remove();
      push({ role: "bot", text: data.answer, sources: data.sources });
    } catch (e) {
      dots.remove();
      push({ role: "bot", text: e.message || t("error"), error: true });
    } finally {
      busy = false;
      send.disabled = false;
      if (open) input.focus();
    }
  }

  // Open and close. The panel spreads out of the bubble like a drop of water (CSS clip-path and a
  // spring scale); closing pulls it back in and the bubble pops.
  function setOpen(next) {
    if (next === open) return;
    open = next;
    clearTimeout(closeTimer);
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? t("chatClose") : t("chatOpen"));
    if (!panel.classList.contains("instant")) {
      fab.classList.remove("ripple");
      void fab.offsetWidth; // restart the pop when toggled quickly
      fab.classList.add("ripple");
    }
    if (open) {
      loadTurnstile();
      panel.hidden = false;
      void panel.offsetWidth; // start the transition from the closed state
      panel.classList.add("open");
      fab.classList.add("is-open");
      log.scrollTop = log.scrollHeight;
      setTimeout(() => input.focus({ preventScroll: true }), reduced.matches ? 0 : OPEN_MS * 0.6);
    } else {
      panel.classList.remove("open");
      fab.classList.remove("is-open");
      closeTimer = setTimeout(() => { panel.hidden = true; }, reduced.matches ? 0 : CLOSE_MS);
      fab.focus({ preventScroll: true });
    }
    try { sessionStorage.setItem("chatOpen", open ? "1" : ""); } catch {}
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  fab.addEventListener("click", () => setOpen(!open));
  fab.addEventListener("animationend", (e) => { if (e.animationName === "chat-ripple") fab.classList.remove("ripple"); });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
  clearBtn.addEventListener("click", () => { messages = []; store.save(messages); renderAll(); input.focus(); });
  SF.onLang(renderAll);

  renderAll();
  // Stay open across page changes within the tab, without replaying the opening motion.
  let wasOpen = false;
  try { wasOpen = sessionStorage.getItem("chatOpen") === "1"; } catch {}
  if (wasOpen) {
    panel.classList.add("instant");
    setOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove("instant")));
  }
})();
