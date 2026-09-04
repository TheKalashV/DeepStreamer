// Движок реплик стримера. Два режима:
//  - mock: реплики генерятся локально (для отладки UI без сайта).
//  - live: реплики берутся из настоящего чата DeepSeek через DOM-драйвер,
//          с промптом от prompt-builder и разбором ответа парсером.
//
// Экспортирует globalThis.DeepStreamer.Engine.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  // --- MOCK ----------------------------------------------------------------
  const MOCK_LINES = {
    idle: [
      "Так, ну что, посидим немного, осмотримся вокруг.",
      "Тихо сегодня... но мне норм, я люблю такое настроение.",
      "Кто-нибудь тут есть? Пишите в чат, поболтаем!",
    ],
    talking: [
      "О, отличный вопрос из чата! Дайте-ка подумать...",
      "Согласен на все сто, вы прям мои мысли читаете.",
      "Ха, ну вы даёте, я аж развеселился!",
    ],
    gaming: [
      "Так, захожу в игру... ну держитесь, я сегодня в форме!",
      "Аааа, чуть не проиграл! Сердце в пятки ушло.",
      "И вот это победа! Кто говорил, что я не смогу?",
    ],
    reviewing: [
      "Смотрим внимательно... хм, интересная штука.",
      "Ну, по пунктам разберём, что тут у нас.",
      "Честно? Мне нравится. Ставлю твёрдую восьмёрочку.",
    ],
    reading: [
      "Читаю чат... о, сколько вас тут, спасибо что зашли!",
      "Вижу-вижу ваши сообщения, сейчас отвечу.",
    ],
    sleeping: [
      "Что-то я подустал... прикорну на минутку.",
      "Ммм... пять минуточек... zzz...",
    ],
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function mockSpeak(state) {
    const activity = state.streamer.activity;
    const pool = MOCK_LINES[activity] || MOCK_LINES.idle;
    const text = pick(pool);
    const emotion = ns.StreamState.guessEmotion(text);
    return { text, emotion, activity };
  }

  // --- LIVE ----------------------------------------------------------------
  async function liveSpeak(state, settings) {
    const { DomDriver, PromptBuilder, Parser } = ns;
    const prompt = PromptBuilder.build(state, settings);
    const res = await DomDriver.ask(prompt, { timeoutMs: 45000 });
    if (!res.ok) {
      return { error: res.error || "no-response", raw: res.text || "" };
    }
    const parsed = Parser.parse(res.text);
    return { ...parsed, raw: res.text };
  }

  async function speak(state, settings) {
    if (settings.engineMode === "live") {
      return liveSpeak(state, settings);
    }
    return mockSpeak(state);
  }

  ns.Engine = { speak, mockSpeak };
})();
