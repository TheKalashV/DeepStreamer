// DOM-драйвер — общается с сайтом DeepSeek без API: отправляет сообщение
// в чат и читает ответ из DOM.
//
// Философия: НЕ жёсткая привязка к селекторам. Драйвер сначала пробует
// "известные" селекторы, а если они не сработали — включает АВТО-ПОИСК:
// эвристически находит поле ввода / кнопку отправки / ленту сообщений по
// признакам (размер, роль, placeholder, положение на экране и т.п.),
// оценивая кандидатов баллами. Найденное кэшируется; при поломке —
// повторное авто-обнаружение (self-healing).
//
// Экспортирует globalThis.DeepStreamer.DomDriver.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  // Кэш найденных узлов (сбрасывается при потере валидности).
  const cache = { input: null, sendBtn: null };

  // ---------------------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------------------
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  }

  function rectOf(el) {
    return el.getBoundingClientRect();
  }

  function textOf(el) {
    return (el.innerText || el.textContent || "").trim();
  }

  function attr(el, name) {
    return (el.getAttribute?.(name) || "").toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Поиск ПОЛЯ ВВОДА (авто-поиск по баллам)
  // ---------------------------------------------------------------------------
  const KNOWN_INPUT_SELECTORS = [
    "textarea#chat-input",
    'textarea[placeholder]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    "textarea",
  ];

  function scoreInput(el) {
    if (!isVisible(el)) return -1;
    const r = rectOf(el);
    let score = 0;

    // Крупное поле — хорошо.
    if (r.width > 200) score += 3;
    if (r.width > 400) score += 2;
    if (r.height >= 20 && r.height < 260) score += 2;

    // Расположено в нижней части экрана (типично для чат-инпута).
    const vh = window.innerHeight;
    if (r.top > vh * 0.55) score += 4;
    if (r.bottom > vh * 0.75) score += 2;

    // Признаки по атрибутам/плейсхолдеру.
    const ph = attr(el, "placeholder") + " " + attr(el, "aria-label");
    if (/(message|ask|send|type|deepseek|спрос|сообщени|напиш|введ)/.test(ph)) score += 4;
    if (attr(el, "role") === "textbox") score += 2;
    if (el.tagName === "TEXTAREA") score += 2;
    if (el.isContentEditable) score += 2;

    // Штраф за очевидно посторонние поля (поиск и т.п.).
    if (/(search|поиск|url|http)/.test(ph)) score -= 3;
    if (attr(el, "type") === "search") score -= 3;

    return score;
  }

  function discoverInput() {
    const candidates = new Set();
    KNOWN_INPUT_SELECTORS.forEach((sel) =>
      document.querySelectorAll(sel).forEach((n) => candidates.add(n))
    );
    // Дополнительно — все потенциально вводимые элементы.
    document
      .querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
      .forEach((n) => candidates.add(n));

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const s = scoreInput(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best;
  }

  function findInput() {
    if (cache.input && isVisible(cache.input)) return cache.input;
    cache.input = discoverInput();
    return cache.input;
  }

  // ---------------------------------------------------------------------------
  // Поиск КНОПКИ ОТПРАВКИ (авто-поиск рядом с полем ввода)
  // ---------------------------------------------------------------------------
  function looksLikeSend(el) {
    const label = attr(el, "aria-label") + " " + attr(el, "title") + " " + textOf(el).toLowerCase();
    if (/(send|submit|отправ)/.test(label)) return true;
    // Иконка-стрелка внутри.
    if (el.querySelector('svg, [class*="arrow"], [class*="send"]')) return true;
    return false;
  }

  function scoreSend(el, inputRect) {
    if (!isVisible(el)) return -1;
    const r = rectOf(el);
    let score = 0;

    // Маленькая квадратная кнопка — типичный "отправить".
    if (r.width < 90 && r.height < 90) score += 2;

    // Рядом с полем ввода (справа и на той же высоте).
    if (inputRect) {
      const sameRow = Math.abs(r.top - inputRect.top) < 120 || Math.abs(r.bottom - inputRect.bottom) < 120;
      const toTheRight = r.left >= inputRect.left;
      if (sameRow) score += 3;
      if (sameRow && toTheRight) score += 2;
    }

    if (looksLikeSend(el)) score += 4;
    if (attr(el, "type") === "submit") score += 2;
    if (attr(el, "aria-disabled") === "true" || el.disabled) score -= 1;

    return score;
  }

  function discoverSendButton(input) {
    const inputRect = input ? rectOf(input) : null;
    const scope = input?.closest("form, [class*='input'], [class*='composer']") || document;
    const candidates = new Set();
    scope.querySelectorAll('button, [role="button"], div[class*="send"], div[class*="button"]').forEach((n) =>
      candidates.add(n)
    );
    // Подстраховка: искать по всему документу, если в scope пусто.
    if (!candidates.size) {
      document.querySelectorAll('button, [role="button"]').forEach((n) => candidates.add(n));
    }

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const s = scoreSend(el, inputRect);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    // Требуем минимальную уверенность, иначе лучше Enter.
    return bestScore >= 4 ? best : null;
  }

  function findSendButton(input) {
    if (cache.sendBtn && isVisible(cache.sendBtn)) return cache.sendBtn;
    cache.sendBtn = discoverSendButton(input);
    return cache.sendBtn;
  }

  // ---------------------------------------------------------------------------
  // Ввод текста (корректно для React-полей)
  // ---------------------------------------------------------------------------
  function setNativeValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
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
    const opts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  // ---------------------------------------------------------------------------
  // Чтение ОТВЕТА (авто-поиск ленты сообщений)
  // ---------------------------------------------------------------------------
  const KNOWN_MESSAGE_SELECTORS = [
    "[data-message-author-role]",
    "[class*='message']",
    "[class*='markdown']",
    "[class*='chat']",
  ];

  function collectMessageNodes() {
    const set = new Set();
    KNOWN_MESSAGE_SELECTORS.forEach((sel) =>
      document.querySelectorAll(sel).forEach((n) => {
        if (textOf(n)) set.add(n);
      })
    );
    // Авто-поиск: если ничего не нашли — берём крупные текстовые блоки в
    // верхней части экрана (там, где лента).
    if (!set.size) {
      document.querySelectorAll("div, article, section, p").forEach((n) => {
        const t = textOf(n);
        if (t.length > 15 && n.children.length < 40) {
          const r = rectOf(n);
          if (r.width > 200 && isVisible(n)) set.add(n);
        }
      });
    }
    // Возвращаем в порядке документа.
    return Array.from(set).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function lastAssistantText(sentText) {
    const nodes = collectMessageNodes();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const text = textOf(nodes[i]);
      if (!text) continue;
      if (sentText && text === sentText.trim()) continue;
      // Отсечь узлы, которые целиком содержатся в другом (берём самый глубокий
      // осмысленный блок).
      return text;
    }
    return "";
  }

  async function waitForResponse(sentText, { timeoutMs = 45000, quietMs = 1400 } = {}) {
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

  // ---------------------------------------------------------------------------
  // Публичный API
  // ---------------------------------------------------------------------------
  async function ask(text, opts = {}) {
    let input = findInput();
    if (!input) {
      // Повторное авто-обнаружение (self-healing).
      cache.input = null;
      input = discoverInput();
    }
    if (!input) return { ok: false, error: "input-not-found", text: "" };

    typeInto(input, text);
    await delay(80);

    const btn = findSendButton(input);
    if (btn && attr(btn, "aria-disabled") !== "true" && !btn.disabled) {
      btn.click();
    } else {
      pressEnter(input);
    }

    const { text: answer, timedOut } = await waitForResponse(text, opts);
    if (!answer) {
      // Возможно, узлы сместились — сбросим кэш для следующего раза.
      cache.input = null;
      cache.sendBtn = null;
    }
    return { ok: !!answer, error: timedOut ? "timeout" : answer ? null : "no-response", text: answer };
  }

  // Диагностика того, что драйвер видит на странице.
  function probe() {
    const input = findInput();
    const btn = input ? findSendButton(input) : null;
    return {
      inputFound: !!input,
      inputTag: input ? input.tagName + (input.isContentEditable ? "[ce]" : "") : null,
      inputScore: input ? scoreInput(input) : null,
      sendButtonFound: !!btn,
      messageNodes: collectMessageNodes().length,
      url: location.href,
    };
  }

  function resetCache() {
    cache.input = null;
    cache.sendBtn = null;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  ns.DomDriver = { ask, probe, resetCache, findInput, findSendButton, lastAssistantText };
})();
