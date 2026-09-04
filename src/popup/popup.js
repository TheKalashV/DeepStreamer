// Popup = панель управления стримом. Отсюда управляем content script на
// вкладке DeepSeek через chrome.tabs.sendMessage. Настройки пишем в storage
// (content script на них реагирует).

(function () {
  const { getSettings, setSettings } = globalThis.DeepStreamer.Settings;

  const $ = (id) => document.getElementById(id);
  const els = {
    version: $("version"),
    toggle: $("toggle"),
    statusDot: $("statusDot"),
    statusText: $("statusText"),
    enabled: $("enabled"),
    ttsEnabled: $("ttsEnabled"),
    subtitlesEnabled: $("subtitlesEnabled"),
    autoStart: $("autoStart"),
    engineMode: $("engineMode"),
    activity: $("activity"),
    ttsVoice: $("ttsVoice"),
    loopIntervalMs: $("loopIntervalMs"),
    loopVal: $("loopVal"),
    diagBody: $("diagBody"),
    reprobe: $("reprobe"),
    hint: $("hint"),
  };

  let settings = null;
  let running = false;

  // Активности из общей модели (дублируем список, чтобы не грузить content-модуль).
  const ACTIVITIES = {
    idle: "Простаивает", talking: "Общается", gaming: "Играет",
    reviewing: "Обзор", thinking: "Думает", sleeping: "Спит",
    music: "Слушает музыку", reading: "Читает чат", celebrating: "Радуется",
  };

  function hint(text) {
    els.hint.textContent = text;
    clearTimeout(hint._t);
    hint._t = setTimeout(() => (els.hint.textContent = ""), 2000);
  }

  // --- Связь с активной вкладкой ------------------------------------------
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function isDeepseek(tab) {
    return tab && /:\/\/([^/]*\.)?deepseek\.com\//.test(tab.url || "");
  }

  async function sendToContent(command, value) {
    const tab = await activeTab();
    if (!isDeepseek(tab)) return { ok: false, error: "not-deepseek" };
    try {
      return await chrome.tabs.sendMessage(tab.id, { ns: "deepstreamer", command, value });
    } catch (e) {
      return { ok: false, error: "no-content-script" };
    }
  }

  // --- Рендер состояния ----------------------------------------------------
  function fillActivitySelect() {
    els.activity.innerHTML = Object.entries(ACTIVITIES)
      .map(([k, label]) => `<option value="${k}">${label}</option>`)
      .join("");
  }

  function setRunningUI(isRunning, reachable) {
    running = isRunning;
    els.toggle.disabled = !reachable;
    els.toggle.textContent = isRunning ? "⏸ Пауза" : "▶ Запустить стрим";
    els.toggle.classList.toggle("is-live", isRunning);
    els.statusDot.className = "ds-dot " + (isRunning ? "is-live" : reachable ? "is-ready" : "is-off");
  }

  async function refreshStatus() {
    const tab = await activeTab();
    if (!isDeepseek(tab)) {
      els.statusText.textContent = "Откройте chat.deepseek.com";
      setRunningUI(false, false);
      els.diagBody.textContent = "Вкладка DeepSeek не активна.";
      return;
    }
    const res = await sendToContent("get-status");
    if (!res || !res.ok) {
      els.statusText.textContent = "Обновите страницу DeepSeek";
      setRunningUI(false, false);
      els.diagBody.textContent = res?.error === "no-content-script"
        ? "Content script не загружен. Обновите вкладку (F5)."
        : "Нет связи со страницей.";
      return;
    }
    els.statusText.textContent = res.running ? "В эфире" : "Готов к запуску";
    setRunningUI(res.running, true);
    renderDiag(res.probe);
    if (res.state) els.activity.value = res.state.activity;
  }

  function renderDiag(probe) {
    if (!probe) { els.diagBody.textContent = "—"; return; }
    const ok = (b) => (b ? "✅" : "❌");
    els.diagBody.innerHTML = [
      `Поле ввода: ${ok(probe.inputFound)} ${probe.inputTag || ""}`,
      `Кнопка отправки: ${ok(probe.sendButtonFound)}`,
      `Блоков сообщений: ${probe.messageNodes}`,
    ].join("<br>");
  }

  // --- Загрузка настроек ---------------------------------------------------
  async function load() {
    settings = await getSettings();
    els.version.textContent = "v" + chrome.runtime.getManifest().version;

    els.enabled.checked = !!settings.enabled;
    els.ttsEnabled.checked = !!settings.ttsEnabled;
    els.subtitlesEnabled.checked = !!settings.subtitlesEnabled;
    els.autoStart.checked = !!settings.autoStart;
    els.engineMode.value = settings.engineMode;
    els.loopIntervalMs.value = settings.loopIntervalMs;
    els.loopVal.textContent = (settings.loopIntervalMs / 1000).toFixed(1);

    fillActivitySelect();
    await loadVoices();
    await refreshStatus();
  }

  // Голоса берём из самого popup (Web Speech доступен и здесь).
  async function loadVoices() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const render = () => {
      const voices = synth.getVoices();
      const cur = settings.ttsVoice || "";
      els.ttsVoice.innerHTML =
        '<option value="">По умолчанию</option>' +
        voices
          .map((v) => `<option value="${v.name}" ${v.name === cur ? "selected" : ""}>${v.name} (${v.lang})</option>`)
          .join("");
    };
    render();
    synth.addEventListener?.("voiceschanged", render);
  }

  // --- Обработчики ---------------------------------------------------------
  els.toggle.addEventListener("click", async () => {
    const res = await sendToContent("toggle");
    if (res?.ok) setTimeout(refreshStatus, 200);
  });

  els.enabled.addEventListener("change", async () => {
    settings = await setSettings({ enabled: els.enabled.checked });
    hint(els.enabled.checked ? "Режим стрима включён" : "Выключено");
    setTimeout(refreshStatus, 300);
  });

  els.ttsEnabled.addEventListener("change", async () => {
    await setSettings({ ttsEnabled: els.ttsEnabled.checked });
    hint("Озвучка: " + (els.ttsEnabled.checked ? "вкл" : "выкл"));
  });

  els.subtitlesEnabled.addEventListener("change", async () => {
    await setSettings({ subtitlesEnabled: els.subtitlesEnabled.checked });
    hint("Субтитры: " + (els.subtitlesEnabled.checked ? "вкл" : "выкл"));
  });

  els.autoStart.addEventListener("change", async () => {
    await setSettings({ autoStart: els.autoStart.checked });
  });

  els.engineMode.addEventListener("change", async () => {
    await setSettings({ engineMode: els.engineMode.value });
    hint("Источник: " + els.engineMode.selectedOptions[0].text);
  });

  els.activity.addEventListener("change", () => {
    sendToContent("set-activity", els.activity.value);
  });

  els.ttsVoice.addEventListener("change", async () => {
    await setSettings({ ttsVoice: els.ttsVoice.value });
  });

  els.loopIntervalMs.addEventListener("input", () => {
    els.loopVal.textContent = (els.loopIntervalMs.value / 1000).toFixed(1);
  });
  els.loopIntervalMs.addEventListener("change", async () => {
    await setSettings({ loopIntervalMs: Number(els.loopIntervalMs.value) });
  });

  els.reprobe.addEventListener("click", async () => {
    const res = await sendToContent("probe");
    if (res?.ok) renderDiag(res.probe);
    hint("Пересканировано");
  });

  load();
})();
