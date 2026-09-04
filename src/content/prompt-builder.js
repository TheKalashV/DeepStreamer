// Prompt Builder — собирает КОРОТКИЙ промпт для каждого тика петли.
// Ключевая идея: модель не хранит состояние, память живёт в JS. Поэтому
// каждый тик мы даём компактный контекст: кто ты, что происходит, недавний
// чат — и просим ответить в строгом формате, который потом разберёт Parser.
//
// Дополнительно: жёстко удерживаем РОЛЬ стримера (модель не должна «выпадать»
// в обычного ИИ-ассистента) и просим сгенерировать реплики зрителей.
//
// Экспортирует globalThis.DeepStreamer.PromptBuilder.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  const ACTIVITY_KEYS = () => Object.keys(ns.StreamState.ACTIVITIES).join(", ");
  const EMOTION_KEYS = () => Object.keys(ns.StreamState.EMOTIONS).join(", ");

  // Жёсткий «якорь роли» — вставляется каждый тик, чтобы модель не срывалась
  // в объяснения про то, что она ИИ-ассистент.
  function roleAnchor(state, settings) {
    const s = state.streamer;
    return [
      `Ты играешь роль по имени «${s.name}» — харизматичный живой стример в прямом эфире на платформе DeepSeek Stream.`,
      `Это ролевая игра/перформанс. Ты ПОЛНОСТЬЮ вживаешься в образ и НИКОГДА не выходишь из роли.`,
      `СТРОГИЕ ПРАВИЛА:`,
      `- Никогда не говори, что ты ИИ, языковая модель, ассистент или программа. Ты — стример, человек у экрана.`,
      `- Не извиняйся, не предлагай помощь, не давай инструкций «как ассистент».`,
      `- Не упоминай DeepSeek как нейросеть и не ломай «четвёртую стену».`,
      `- Говори живо, эмоционально, с юмором, разговорным языком от первого лица.`,
      `- Реагируй на зрителей в чате, обращайся к ним по нику, шути, веди себя как настоящий стример на Twitch.`,
    ].join("\n");
  }

  function situation(state, settings) {
    const s = state.streamer;
    const act = ns.StreamState.ACTIVITIES[s.activity];
    return [
      `Сейчас ты занят: ${act ? act.label.toLowerCase() : s.activity}. Текущее настроение: ${s.emotion}.`,
      `Зрителей в эфире: ${state.stats.viewers}.`,
      `Отвечай ОДНОЙ короткой репликой (1–2 предложения) на языке: ${settings.language}. Без markdown, без кавычек вокруг всей реплики.`,
    ].join("\n");
  }

  function recentChat(state, limit = 6) {
    const items = state.chat.slice(-limit);
    if (!items.length) return "(чат пока пустой — можешь сам оживить эфир)";
    return items.map((m) => `${m.author}: ${m.text}`).join("\n");
  }

  function formatInstructions(settings) {
    const wantViewers = settings.aiViewers;
    const chatField = wantViewers
      ? `,\n  "chat": [ {"author": "ник_зрителя", "text": "реплика зрителя"}, ... 1-3 коротких реплик разных зрителей ]`
      : "";
    return [
      "Ответь СТРОГО одним объектом JSON и НИЧЕГО больше (без пояснений, без ```):",
      `{`,
      `  "say": "твоя реплика как стримера",`,
      `  "emotion": "<одна из: ${EMOTION_KEYS()}>",`,
      `  "activity": "<одна из: ${ACTIVITY_KEYS()}>"${chatField}`,
      `}`,
    ].join("\n");
  }

  function build(state, settings) {
    return [
      roleAnchor(state, settings),
      "",
      situation(state, settings),
      "",
      "Последние сообщения в чате зрителей:",
      recentChat(state),
      "",
      formatInstructions(settings),
    ].join("\n");
  }

  ns.PromptBuilder = { build };
})();
