// Точка входа content script. Связывает оркестратор, UI, TTS и DOM-драйвер.
//
// Управление (старт/пауза, TTS, субтитры, смена активности) приходит из POPUP
// расширения через chrome.runtime.sendMessage — на самом сайте кнопок нет.

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

  // Реакция UI на события петли оркестратора.
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

  // Команды из UI сайта (только ввод в чат — единственный интерактив на сайте).
  function handleUICommand(cmd, arg) {
    if (cmd === "chat" && orchestrator) {
      orchestrator.addChatMessage("вы", arg, "#4d6bfe");
    }
  }

  // Команды из POPUP расширения.
  function handlePopupCommand(msg, sendResponse) {
    switch (msg.command) {
      case "get-status":
        sendResponse({
          ok: true,
          running: orchestrator ? orchestrator.isRunning() : false,
          probe: ns.DomDriver.probe(),
          state: orchestrator ? summarizeState(orchestrator.getState()) : null,
        });
        return;
      case "start":
        orchestrator?.start();
        sendResponse({ ok: true });
        return;
      case "stop":
        orchestrator?.stop();
        sendResponse({ ok: true });
        return;
      case "toggle":
        if (orchestrator) {
          if (orchestrator.isRunning()) orchestrator.stop();
          else orchestrator.start();
        }
        sendResponse({ ok: true, running: orchestrator?.isRunning() });
        return;
      case "set-activity":
        if (orchestrator) {
          orchestrator.getState().streamer.activity = arg(msg);
          ui?.updateAvatar(orchestrator.getState());
          ui?.updateHud(orchestrator.getState());
        }
        sendResponse({ ok: true });
        return;
      case "probe":
        ns.DomDriver.resetCache();
        sendResponse({ ok: true, probe: ns.DomDriver.probe() });
        return;
      default:
        sendResponse({ ok: false, error: "unknown-command" });
    }
  }

  function arg(msg) {
    return msg.value;
  }

  function summarizeState(state) {
    return {
      activity: state.streamer.activity,
      emotion: state.streamer.emotion,
      viewers: state.stats.viewers,
      tick: state.stats.tick,
      messagesSpoken: state.stats.messagesSpoken,
    };
  }

  function mountStream() {
    if (!settings.enabled) return;
    if (document.getElementById("deepstreamer-root")) return;

    orchestrator = ns.Orchestrator.createOrchestrator({
      getSettings,
      onEvent: handleEvent,
    });

    ui = ns.UI.createUI({ settings, onCommand: handleUICommand });
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

    // Приём команд из popup.
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.ns !== "deepstreamer") return false;
        handlePopupCommand(msg, sendResponse);
        return true; // асинхронный ответ
      });
    }

    console.log("[DeepStreamer] content script активен, режим стрима готов");
  }

  init();
})();
