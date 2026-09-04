// Точка входа content script. Связывает оркестратор, UI, TTS и DOM-драйвер.
//
// Порядок подключения модулей задан в manifest.json (settings → stream-state →
// dom-driver → parser → prompt-builder → tts → engine → orchestrator → ui →
// content). Здесь только "проводка" и реакция на настройки/команды.

(function () {
  const ns = globalThis.DeepStreamer;
  const { getSettings, setSettings, onSettingsChanged } = ns.Settings;

  const ROOT_ATTR = "data-deepstreamer";
  const ROOT_FLAG = "ds-active";

  let settings = null;
  let ui = null;
  let orchestrator = null;

  function applyRootState() {
    const root = document.documentElement;
    if (settings?.enabled) root.setAttribute(ROOT_ATTR, ROOT_FLAG);
    else root.removeAttribute(ROOT_ATTR);
  }

  // Реакция UI на события петли.
  function handleEvent(evt) {
    if (!ui) return;
    const { type, payload, state } = evt;
    switch (type) {
      case "start":
        ui.onStart();
        ui.updateHud(state);
        break;
      case "stop":
        ui.onStop();
        break;
      case "thinking":
        ui.setThinking(true);
        ui.updateHud(state);
        break;
      case "speak":
        ui.setThinking(false);
        ui.updateAvatar(state);
        ui.updateHud(state);
        ui.showSubtitle(payload.text);
        break;
      case "speak-end":
        ui.updateAvatar(state);
        break;
      case "chat":
        ui.addChat(payload);
        ui.updateHud(state);
        break;
      case "error":
        console.warn("[DeepStreamer] engine error:", payload);
        ui.setThinking(false);
        break;
    }
  }

  // Команды из UI (кнопки/чат).
  function handleCommand(cmd, arg) {
    switch (cmd) {
      case "toggle":
        if (orchestrator.isRunning()) orchestrator.stop();
        else orchestrator.start();
        break;
      case "tts":
        setSettings({ ttsEnabled: !settings.ttsEnabled });
        break;
      case "subs":
        setSettings({ subtitlesEnabled: !settings.subtitlesEnabled });
        break;
      case "exit":
        setSettings({ enabled: false });
        break;
      case "set-activity":
        // Ручное задание активности зрителем/ведущим.
        orchestrator.getState().streamer.activity = arg;
        ui.updateAvatar(orchestrator.getState());
        ui.updateHud(orchestrator.getState());
        break;
      case "chat":
        // Сообщение от пользователя (владельца) в чат.
        orchestrator.addChatMessage("вы", arg, "#4d6bfe");
        break;
    }
  }

  function mountStream() {
    if (!settings.enabled) return;
    if (document.getElementById("deepstreamer-root")) return;

    orchestrator = ns.Orchestrator.createOrchestrator({
      getSettings,
      onEvent: handleEvent,
    });

    ui = ns.UI.createUI({ settings, onCommand: handleCommand });
    ui.mount();
    ui.updateAvatar(orchestrator.getState());
    ui.updateHud(orchestrator.getState());

    if (settings.autoStart) orchestrator.start();
  }

  function unmountStream() {
    if (orchestrator) orchestrator.stop();
    if (ui) ui.unmount();
    ui = null;
    orchestrator = null;
  }

  async function init() {
    settings = await getSettings();
    applyRootState();

    if (settings.enabled) mountStream();

    onSettingsChanged((next) => {
      const wasEnabled = settings.enabled;
      settings = next;
      applyRootState();

      if (settings.enabled && !wasEnabled) mountStream();
      else if (!settings.enabled && wasEnabled) unmountStream();

      if (ui) ui.applySettings(settings);
      if (orchestrator) orchestrator.updateSettings(settings);
    });

    console.log("[DeepStreamer] content script активен, режим стрима готов");
  }

  init();
})();
