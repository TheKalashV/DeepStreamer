// Prompt Builder — собирает КОРОТКИЙ промпт для каждого тика петли.
// Ключевая идея: модель не хранит состояние, память живёт в JS. Поэтому
// каждый тик мы даём компактный контекст: кто ты, что происходит, недавний
// чат — и просим ответить в строгом формате, который потом разберёт Parser.
//
// Экспортирует globalThis.DeepStreamer.PromptBuilder.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  const ACTIVITY_KEYS = () => Object.keys(ns.StreamState.ACTIVITIES).join(", ");
  const EMOTION_KEYS = () => Object.keys(ns.StreamState.EMOTIONS).join(", ");

  function systemPreamble(state, settings) {
    const s = state.streamer;
    return [
      `Ты — ${s.name}, ИИ-стример в прямом эфире на платформе DeepSeek Stream.`,
      `Ты ведёшь трансляцию вживую: коротко реагируешь, комментируешь, общаешься со зрителями.`,
      `Твоя текущая активность: ${s.activity}. Твоя эмоция: ${s.emotion}.`,
      `Отвечай ОДНОЙ короткой репликой (1-2 предложения), как живой стример, на языке: ${settings.language}.`,
    ].join(" ");
  }

  function recentChat(state, limit = 5) {
    const items = state.chat.slice(-limit);
    if (!items.length) return "Чат пока пустой.";
    return items.map((m) => `${m.author}: ${m.text}`).join("\n");
  }

  function formatInstructions() {
    return [
      "Ответь СТРОГО в формате JSON без пояснений и без markdown-ограждений:",
      `{"say": "твоя реплика", "emotion": "<одна из: ${EMOTION_KEYS()}>", "activity": "<одна из: ${ACTIVITY_KEYS()}>"}`,
    ].join("\n");
  }

  function build(state, settings) {
    return [
      systemPreamble(state, settings),
      "",
      "Недавние сообщения чата:",
      recentChat(state),
      "",
      formatInstructions(),
    ].join("\n");
  }

  ns.PromptBuilder = { build };
})();
