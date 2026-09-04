// Orchestrator — сердце проекта: петля (loop), которая тик за тиком:
//   1) просит движок выдать реплику (mock или live через DeepSeek),
//   2) обновляет состояние стримера (активность/эмоция/статистика),
//   3) уведомляет UI об изменениях (речь, эмоция, чат),
//   4) озвучивает реплику и ждёт паузу до следующего тика.
//
// Состояние держится здесь (внешняя память), модель — без памяти.
// Экспортирует globalThis.DeepStreamer.Orchestrator.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  function createOrchestrator({ getSettings, onEvent }) {
    const State = ns.StreamState;
    let state = State.createInitialState();
    let settings = null;
    let running = false;
    let loopHandle = null;
    let mockViewerHandle = null;

    function emit(type, payload) {
      onEvent?.({ type, payload, state });
    }

    function setActivity(activity) {
      if (activity && State.ACTIVITIES[activity]) {
        state.streamer.activity = activity;
      }
    }

    function setEmotion(emotion) {
      if (emotion && State.EMOTIONS[emotion]) {
        state.streamer.emotion = emotion;
      }
    }

    // Простая автономная смена активности, если движок её не задал.
    function driftActivity() {
      const e = state.streamer.energy;
      if (e < 0.15) {
        setActivity("sleeping");
        return;
      }
      // Небольшой шанс сменить занятие.
      if (Math.random() < 0.25) {
        const pool = ["idle", "talking", "gaming", "reviewing", "reading", "music"];
        setActivity(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    function addTranscript(text, emotion, activity) {
      const entry = {
        id: cryptoId(),
        text,
        emotion,
        activity,
        ts: Date.now(),
      };
      state.transcript.push(entry);
      if (state.transcript.length > 50) state.transcript.shift();
      state.stats.messagesSpoken++;
      return entry;
    }

    function addChatMessage(author, text, color) {
      const entry = {
        id: cryptoId(),
        author,
        text,
        color: color || randomColor(author),
        ts: Date.now(),
      };
      state.chat.push(entry);
      if (state.chat.length > 200) state.chat.shift();
      emit("chat", entry);
      return entry;
    }

    async function tick() {
      if (!running) return;
      state.stats.tick++;

      // Энергия медленно падает; сон восстанавливает.
      if (state.streamer.activity === "sleeping") {
        state.streamer.energy = Math.min(1, state.streamer.energy + 0.2);
      } else {
        state.streamer.energy = Math.max(0, state.streamer.energy - 0.03);
      }

      emit("thinking", { tick: state.stats.tick });

      let result;
      try {
        result = await ns.Engine.speak(state, settings);
      } catch (err) {
        result = { error: String(err) };
      }

      if (!running) return;

      if (result?.error) {
        emit("error", { error: result.error, raw: result.raw });
      } else if (result?.text) {
        if (result.activity) setActivity(result.activity);
        else driftActivity();
        setEmotion(result.emotion || "neutral");

        const entry = addTranscript(result.text, state.streamer.emotion, state.streamer.activity);
        emit("speak", entry);

        // Озвучка; следующий тик планируем после конца речи (или сразу).
        await speakEntry(entry);
      } else {
        driftActivity();
      }

      scheduleNext();
    }

    function speakEntry(entry) {
      return new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          emit("speak-end", entry);
          resolve();
        };
        ns.Tts.speak(entry.text, settings, {
          onStart: () => emit("speak-start", entry),
          onEnd: done,
        });
        // Страховка: не ждать вечно, если TTS выключен/молчит.
        setTimeout(done, 8000);
      });
    }

    function scheduleNext() {
      if (!running) return;
      const interval = Math.max(1500, settings.loopIntervalMs || 6000);
      loopHandle = setTimeout(tick, interval);
    }

    // Демо-зрители для mock-режима: подкидывают сообщения в чат.
    const MOCK_VIEWERS = ["neon_fox", "pixel_kate", "darkwave", "lol_master", "quietfan", "byteworm"];
    const MOCK_MSGS = [
      "привет стример!", "гоу в игру", "ахаха топ", "красавчик", "а что дальше?",
      "первый!", "поставь музыку", "как настроение?", "легенда", "жду обзор",
    ];
    function startMockViewers() {
      stopMockViewers();
      mockViewerHandle = setInterval(() => {
        if (!running || settings.engineMode !== "mock") return;
        state.stats.viewers = 10 + Math.floor(Math.random() * 90);
        if (Math.random() < 0.8) {
          const author = MOCK_VIEWERS[Math.floor(Math.random() * MOCK_VIEWERS.length)];
          const text = MOCK_MSGS[Math.floor(Math.random() * MOCK_MSGS.length)];
          addChatMessage(author, text);
        }
      }, 2500);
    }
    function stopMockViewers() {
      if (mockViewerHandle) clearInterval(mockViewerHandle);
      mockViewerHandle = null;
    }

    async function start() {
      if (running) return;
      settings = await getSettings();
      running = true;
      state.running = true;
      state.stats.startedAt = Date.now();
      emit("start", {});
      if (settings.engineMode === "mock") startMockViewers();
      tick();
    }

    function stop() {
      running = false;
      state.running = false;
      if (loopHandle) clearTimeout(loopHandle);
      loopHandle = null;
      stopMockViewers();
      ns.Tts.stop();
      emit("stop", {});
    }

    async function updateSettings(next) {
      const wasRunning = running;
      settings = next;
      if (wasRunning) {
        if (settings.engineMode === "mock") startMockViewers();
        else stopMockViewers();
      }
      emit("settings", next);
    }

    function getState() {
      return state;
    }

    return { start, stop, getState, updateSettings, addChatMessage, isRunning: () => running };
  }

  function cryptoId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function randomColor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return `hsl(${h}, 70%, 65%)`;
  }

  ns.Orchestrator = { createOrchestrator };
})();
