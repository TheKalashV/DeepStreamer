// Service worker (MV3). Пока минимальный: инициализация настроек
// и точка для будущей логики (обмен сообщениями, команды и т.д.).

const STORAGE_KEY = "deepstreamer:settings";
const DEFAULT_SETTINGS = { enabled: true };

async function ensureSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  if (!stored[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
  console.log("[DeepStreamer] установлено / обновлено");
});

// Заготовка обработчика сообщений от content script / popup.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ type: "pong", ts: Date.now() });
    return false;
  }
  return false;
});
