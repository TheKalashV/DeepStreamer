// TTS — озвучка реплик стримера через Web Speech API (использует системные
// голоса, в т.ч. Microsoft на Windows). Отключается в настройках.
//
// Экспортирует globalThis.DeepStreamer.Tts.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  const synth = window.speechSynthesis;

  let voices = [];

  function loadVoices() {
    voices = synth ? synth.getVoices() : [];
    return voices;
  }

  if (synth) {
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
  }

  function listVoices() {
    if (!voices.length) loadVoices();
    return voices.map((v) => ({ name: v.name, lang: v.lang, default: v.default }));
  }

  function pickVoice(settings) {
    if (!voices.length) loadVoices();
    if (settings.ttsVoice) {
      const byName = voices.find((v) => v.name === settings.ttsVoice);
      if (byName) return byName;
    }
    // Иначе — первый голос, подходящий под язык.
    const lang = (settings.language || "ru").toLowerCase();
    return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) || voices[0] || null;
  }

  function speak(text, settings, { onStart, onEnd } = {}) {
    if (!synth || !settings.ttsEnabled || !text) {
      onEnd?.();
      return;
    }
    try {
      synth.cancel(); // не накапливать очередь
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(settings);
      if (v) u.voice = v;
      u.lang = v?.lang || settings.language || "ru-RU";
      u.rate = clamp(settings.ttsRate, 0.5, 2, 1);
      u.pitch = clamp(settings.ttsPitch, 0, 2, 1);
      u.volume = clamp(settings.ttsVolume, 0, 1, 1);
      u.onstart = () => onStart?.();
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
      synth.speak(u);
    } catch {
      onEnd?.();
    }
  }

  // Оценка длительности речи (мс) — для случаев, когда TTS выключен, либо как
  // страховочный таймаут. Учитываем скорость чтения и rate.
  function estimateDurationMs(text, settings) {
    const chars = (text || "").length;
    const rate = clamp(settings?.ttsRate, 0.5, 2, 1);
    // ~13 символов/сек при rate=1 (комфортная речь) + пауза.
    const base = (chars / 13) * 1000;
    return Math.max(1600, Math.round(base / rate) + 600);
  }

  function stop() {
    try {
      synth?.cancel();
    } catch {}
  }

  function clamp(v, min, max, dflt) {
    const n = Number(v);
    if (Number.isNaN(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  ns.Tts = { speak, stop, listVoices, estimateDurationMs };
})();
