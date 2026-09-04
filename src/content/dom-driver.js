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
  // ID нашего собственного оверлея — его нужно ПОЛНОСТЬЮ исключать из поиска,
  // иначе драйвер найдёт наш чат-инпут / субтитры вместо элементов DeepSeek.
  const OVERLAY_ID = "deepstreamer-root";

  function insideOverlay(el) {
    return !!(el && el.closest && el.closest("#" + OVERLAY_ID));
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (insideOverlay(el)) return false; // никогда не трогаем свой UI
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
    // Пытаемся вставить через beforeinput/execCommand — так рич-редакторы
    // (ProseMirror/Lexical и т.п.) корректно принимают текст.
    try {
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: value,
        })
      );
    } catch {}
    // Явно проставляем содержимое как фолбэк/подтверждение.
    if (textOf(el) !== value) {
      el.textContent = value;
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function currentInputValue(el) {
    return el.isContentEditable ? textOf(el) : el.value || "";
  }

  function clearInput(el) {
    if (!el) return;
    if (el.isContentEditable) {
      el.focus();
      el.textContent = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    } else {
      setNativeValue(el, "");
    }
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
        if (insideOverlay(n)) return; // не читать собственный UI
        if (textOf(n)) set.add(n);
      })
    );
    // Авто-поиск: если ничего не нашли — берём крупные текстовые блоки в
    // верхней части экрана (там, где лента).
    if (!set.size) {
      document.querySelectorAll("div, article, section, p").forEach((n) => {
        if (insideOverlay(n)) return;
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
  function isSendable(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (attr(btn, "aria-disabled") === "true") return false;
    return true;
  }

  // Отправка с проверкой: считаем сообщение отправленным, если поле ввода
  // очистилось. Пробуем кнопку → Enter, с ожиданием активации кнопки.
  async function sendMessage(input, text) {
    // Ждём, пока кнопка отправки станет активной (React обновляет её после ввода).
    let btn = null;
    for (let i = 0; i < 12; i++) {
      btn = findSendButton(input);
      if (isSendable(btn)) break;
      await delay(120);
    }

    const attempts = [
      () => {
        if (isSendable(btn)) btn.click();
        else throw new Error("btn-not-ready");
      },
      () => pressEnter(input),
      () => {
        // Повторно найти кнопку (могла перерисоваться) и кликнуть.
        cache.sendBtn = null;
        const b = findSendButton(input);
        if (isSendable(b)) b.click();
        else throw new Error("btn-not-ready-2");
      },
    ];

    for (const tryOnce of attempts) {
      try {
        tryOnce();
      } catch {
        continue;
      }
      // Проверяем, что поле очистилось → значит отправилось.
      for (let i = 0; i < 8; i++) {
        await delay(100);
        if (currentInputValue(input).trim() === "") return true;
      }
    }
    return currentInputValue(input).trim() === "";
  }

  async function ask(text, opts = {}) {
    let input = findInput();
    if (!input) {
      // Повторное авто-обнаружение (self-healing).
      cache.input = null;
      input = discoverInput();
    }
    if (!input) return { ok: false, error: "input-not-found", text: "" };

    typeInto(input, text);
    await delay(120);

    const sent = await sendMessage(input, text);
    if (!sent) {
      // Не удалось отправить — не оставляем "висящий" текст в поле.
      clearInput(input);
      cache.input = null;
      cache.sendBtn = null;
      return { ok: false, error: "send-failed", text: "" };
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

  // Очистить поле ввода DeepSeek от нашего недоотправленного текста
  // (вызывается при остановке стрима).
  function cleanup() {
    const input = findInput();
    if (input && currentInputValue(input).trim() !== "") clearInput(input);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  ns.DomDriver = {
    ask,
    probe,
    resetCache,
    cleanup,
    findInput,
    findSendButton,
    lastAssistantText,
  };
})();
