// Централизованная работа с настройками расширения.
// Классический скрипт (без ES-модулей): работает в content script, popup
// и service worker. Экспортирует globalThis.DeepStreamer.Settings.

(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    // Режим движка: "mock" — реплики генерятся локально (для отладки UI),
    // "live" — реплики берутся из настоящего чата DeepSeek через DOM-драйвер.
    engineMode: "mock",
    // Автостарт стрима при заходе на сайт.
    autoStart: false,
    // Озвучка (Web Speech API / системный TTS).
    ttsEnabled: true,
    ttsVoice: "", // имя голоса; пусто = голос по умолчанию для языка
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    // Субтитры.
    subtitlesEnabled: true,
    // Пауза между тиками петли, мс.
    loopIntervalMs: 6000,
    // Язык реплик стримера.
    language: "ru",
  };

  const STORAGE_KEY = "deepstreamer:settings";

  async function getSettings() {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] || {}) };
  }

  async function setSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch };
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  }

  function onSettingsChanged(callback) {
    const listener = (changes, area) => {
      if (area === "sync" && changes[STORAGE_KEY]) {
        const { newValue } = changes[STORAGE_KEY];
        callback({ ...DEFAULT_SETTINGS, ...(newValue || {}) });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  ns.Settings = { DEFAULT_SETTINGS, getSettings, setSettings, onSettingsChanged };
})();
