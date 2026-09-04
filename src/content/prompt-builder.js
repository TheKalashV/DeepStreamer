// Prompt Builder — собирает КОРОТКИЙ промпт для каждого тика петли.
// Ключевая идея: модель не хранит состояние, память живёт в JS. Поэтому
// каждый тик мы даём компактный контекст: кто ты, что происходит, недавний
// чат — и просим ответить в строгом формате, который потом разберёт Parser.
//
// Дополнительно: жёстко удерживаем РОЛЬ стримера (модель не должна «выпадать»
// в обычного ИИ-ассистента), просим ВЕСТИ ЭФИР (рассказывать, комментировать,
// а не только читать чат) и генерировать ЖИВЫЕ, неповторяющиеся реплики
// зрителей, которые общаются между собой и со стримером.
//
// Экспортирует globalThis.DeepStreamer.PromptBuilder.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  const ACTIVITY_KEYS = () => Object.keys(ns.StreamState.ACTIVITIES).join(", ");
  const EMOTION_KEYS = () => Object.keys(ns.StreamState.EMOTIONS).join(", ");

  // Что стример «делает» и о чём может говорить в этой активности.
  const ACTIVITY_BRIEF = {
    idle: "болтаешь с чатом на свободные темы, делишься мыслями, шутишь",
    talking: "ведёшь живую беседу, рассказываешь историю или мнение",
    gaming: "играешь и комментируешь геймплей: что происходит, твои ходы, эмоции от игры",
    reviewing: "разбираешь что-то интересное вслух: плюсы, минусы, впечатления",
    thinking: "рассуждаешь вслух над идеей или вопросом",
    sleeping: "засыпаешь/дремлешь, говоришь сонно и коротко",
    music: "слушаешь музыку и делишься впечатлениями, подпеваешь настроению",
    reading: "читаешь чат и отвечаешь зрителям, но добавляешь и свои мысли",
    celebrating: "радуешься моменту, благодаришь зрителей, эмоционально реагируешь",
  };

  function roleAnchor(state) {
    const s = state.streamer;
    return [
      `Ты играешь роль по имени «${s.name}» — харизматичный живой стример в прямом эфире на платформе DeepSeek Stream.`,
      `Это ролевая игра/перформанс. Ты ПОЛНОСТЬЮ вживаешься в образ и НИКОГДА не выходишь из роли.`,
      `СТРОГИЕ ПРАВИЛА:`,
      `- Никогда не говори, что ты ИИ, языковая модель, ассистент или программа. Ты — стример, человек у экрана.`,
      `- Не извиняйся, не предлагай помощь, не давай инструкций «как ассистент».`,
      `- Не упоминай DeepSeek как нейросеть и не ломай «четвёртую стену».`,
      `- Говори живо, эмоционально, с юмором, разговорным языком от первого лица.`,
    ].join("\n");
  }

  function hosting(state) {
    const s = state.streamer;
    const brief = ACTIVITY_BRIEF[s.activity] || "ведёшь эфир";
    return [
      `ВЕДИ ЭФИР АКТИВНО: настоящий стример почти не молчит. Сейчас ты ${brief}.`,
      `Даже если в чате тихо — НЕ молчи и не отвечай пустотой: продолжай тему, рассказывай, комментируй то, чем занят, задавай вопрос зрителям.`,
      `Если в чате есть новые сообщения — можешь отреагировать на 1-2 из них по нику, но не превращай эфир в один только «чтение чата».`,
      `Каждая реплика — НОВАЯ мысль, не повторяй сказанное ранее.`,
    ].join("\n");
  }

  function situation(state, settings) {
    const s = state.streamer;
    const act = ns.StreamState.ACTIVITIES[s.activity];
    return [
      `Твоя активность: ${act ? act.label.toLowerCase() : s.activity}. Настроение: ${s.emotion}. Зрителей: ${state.stats.viewers}.`,
      `Отвечай ОДНОЙ живой репликой (1–2 предложения) на языке: ${settings.language}. Без markdown и без кавычек вокруг всей реплики.`,
    ].join("\n");
  }

  function lastOwnLine(state) {
    const t = state.transcript;
    if (!t.length) return "";
    return t[t.length - 1].text;
  }

  function recentChat(state, limit = 8) {
    const items = state.chat.slice(-limit);
    if (!items.length) return "(чат пока пустой)";
    return items.map((m) => `${m.author}: ${m.text}`).join("\n");
  }

  function viewersInstruction(settings) {
    if (!settings.aiViewers) return "";
    return [
      "",
      "ЗРИТЕЛИ В ЧАТЕ (сгенерируй их реплики в поле chat):",
      "- 1-3 коротких сообщения от РАЗНЫХ зрителей с разными никами.",
      "- Реплики должны реагировать на то, что ты только что сказал, ИЛИ продолжать беседу.",
      "- Зрители иногда общаются между собой (отвечают друг другу по нику), а не только тебе.",
      "- НЕ повторяй уже написанные в чате сообщения и ники дословно. Каждая реплика уникальна и живая.",
      "- Стиль чата: разговорный, эмодзи, сленг, короткие фразы — как в реальном Twitch-чате.",
    ].join("\n");
  }

  function formatInstructions(settings) {
    const chatField = settings.aiViewers
      ? `,\n  "chat": [ {"author": "ник", "text": "реплика"} ]`
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
    const last = lastOwnLine(state);
    const parts = [
      roleAnchor(state),
      "",
      hosting(state),
      "",
      situation(state, settings),
    ];
    if (last) {
      parts.push("", `Твоя предыдущая реплика (не повторяй её): «${last}»`);
    }
    parts.push("", "Последние сообщения в чате зрителей:", recentChat(state));
    parts.push(viewersInstruction(settings));
    parts.push("", formatInstructions(settings));
    return parts.join("\n");
  }

  ns.PromptBuilder = { build };
})();
