// DOM-драйвер — ЕДИНСТВЕННОЕ место, зависящее от вёрстки сайта DeepSeek.
// Задача: программно отправить сообщение в чат и прочитать ответ модели,
// не используя никакого API. Если сайт изменит вёрстку — чиним только здесь.
//
// Экспортирует globalThis.DeepStreamer.DomDriver.
//
// Стратегия намеренно "оборонительная": несколько кандидатов-селекторов,
// нативная эмуляция ввода для React, определение конца ответа по затиханию.

(function () {
  // --- Поиск поля ввода -----------------------------------------------------
  const INPUT_SELECTORS = [
    "textarea#chat-input",
    'textarea[placeholder]',
    'div[contenteditable="true"]',
    "textarea",
  ];

  function findInput() {
    for (const sel of INPUT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  // --- Поиск кнопки отправки ------------------------------------------------
  const SEND_SELECTORS = [
    'div[role="button"][aria-disabled]',
    'button[type="submit"]',
    'button[aria-label*="end" i]',
    'button[aria-label*="отправ" i]',
  ];

  function findSendButton(nearEl) {
    // Ищем кнопку рядом с полем ввода (в общем контейнере).
    const scope = nearEl?.closest("form") || nearEl?.parentElement || document;
    for (const sel of SEND_SELECTORS) {
      const el = scope.querySelector(sel) || document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // --- Ввод текста ----------------------------------------------------------
  // React перехватывает value через свой setter; чтобы событие "долетело",
  // используем нативный setter и диспатчим input/change.
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setContentEditable(el, value) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  }

  function typeInto(el, text) {
    el.focus();
    if (el.isContentEditable) setContentEditable(el, text);
    else setNativeValue(el, text);
  }

  function pressEnter(el) {
    const opts = {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
    };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  // --- Чтение ответов -------------------------------------------------------
  // DeepSeek рендерит сообщения в ленте. Точные классы неизвестны и меняются,
  // поэтому берём "разумных кандидатов" контейнеров сообщений и вычисляем
  // последнее сообщение ассистента как самый нижний блок, не совпадающий с
  // нашим только что отправленным вводом.
  const MESSAGE_CONTAINER_SELECTORS = [
    "[class*='message']",
    "[class*='markdown']",
    "[data-message-author-role]",
  ];

  function collectMessageNodes() {
    const set = new Set();
    for (const sel of MESSAGE_CONTAINER_SELECTORS) {
      document.querySelectorAll(sel).forEach((n) => set.add(n));
    }
    return Array.from(set);
  }

  function lastAssistantText(sentText) {
    const nodes = collectMessageNodes();
    if (!nodes.length) return "";
    // Берём последний по порядку в DOM видимый блок с текстом.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const text = (node.innerText || "").trim();
      if (!text) continue;
      if (sentText && text === sentText.trim()) continue; // это наш ввод
      return text;
    }
    return "";
  }

  // Ждём завершения ответа: следим за текстом последнего блока; когда он
  // перестаёт расти в течение quietMs — считаем ответ завершённым.
  async function waitForResponse(sentText, { timeoutMs = 45000, quietMs = 1200 } = {}) {
    const start = Date.now();
    let lastText = "";
    let lastChange = Date.now();

    return new Promise((resolve) => {
      const tick = () => {
        const now = Date.now();
        const cur = lastAssistantText(sentText);
        if (cur && cur !== lastText) {
          lastText = cur;
          lastChange = now;
        }
        const settled = lastText && now - lastChange >= quietMs;
        const timedOut = now - start >= timeoutMs;
        if (settled || timedOut) {
          resolve({ text: lastText, timedOut: timedOut && !settled });
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  // --- Публичный метод: отправить и получить ответ --------------------------
  async function ask(text, opts = {}) {
    const input = findInput();
    if (!input) {
      return { ok: false, error: "input-not-found", text: "" };
    }
    typeInto(input, text);
    await delay(60);

    const btn = findSendButton(input);
    if (btn && btn.getAttribute("aria-disabled") !== "true") {
      btn.click();
    } else {
      pressEnter(input);
    }

    const { text: answer, timedOut } = await waitForResponse(text, opts);
    return { ok: !!answer, error: timedOut ? "timeout" : null, text: answer };
  }

  // --- Диагностика: что драйвер сейчас "видит" ------------------------------
  function probe() {
    const input = findInput();
    return {
      inputFound: !!input,
      inputTag: input ? input.tagName + (input.isContentEditable ? "[ce]" : "") : null,
      sendButtonFound: !!(input && findSendButton(input)),
      messageNodes: collectMessageNodes().length,
      url: location.href,
    };
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  ns.DomDriver = { ask, probe, findInput, findSendButton, lastAssistantText };
})();
