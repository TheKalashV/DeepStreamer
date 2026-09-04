// Логика popup: показывает и переключает настройки.

(function () {
  const { getSettings, setSettings } = globalThis.DeepStreamer.Settings;

  const enabledEl = document.getElementById("enabled");
  const statusEl = document.getElementById("status");
  const versionEl = document.getElementById("version");

  function showStatus(text) {
    statusEl.textContent = text;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => (statusEl.textContent = ""), 1500);
  }

  async function load() {
    const settings = await getSettings();
    enabledEl.checked = !!settings.enabled;

    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = "v" + manifest.version;
  }

  enabledEl.addEventListener("change", async () => {
    await setSettings({ enabled: enabledEl.checked });
    showStatus(enabledEl.checked ? "Включено" : "Выключено");
  });

  load();
})();
