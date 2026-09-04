// Централизованная работа с настройками расширения.
// Классический скрипт (без ES-модулей), чтобы работать и в content script,
// и в popup, и в service worker. Экспортирует глобальный объект
// globalThis.DeepStreamer.Settings.

(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
  };

  const STORAGE_KEY = "deepstreamer:settings";

  /** Загрузить настройки (с подстановкой значений по умолчанию). */
  async function getSettings() {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] || {}) };
  }

  /** Сохранить частичное обновление настроек. */
  async function setSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch };
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  }

  /** Подписка на изменения настроек. Возвращает функцию отписки. */
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
