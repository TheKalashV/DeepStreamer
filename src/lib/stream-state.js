// Модель состояния ИИ-стримера ("мозг" живёт в JS, не в модели).
// Важно: ЛИЦО стримера — ВСЕГДА лицо (face-эмодзи). Предметы активности
// (геймпад, наушники, лупа...) показываются отдельным значком-реквизитом,
// а не вместо лица.
// Экспортирует globalThis.DeepStreamer.StreamState.

(function () {
  // Активности стримера.
  //   face   — какое ЛИЦО показывать по умолчанию в этой активности (всегда лицо!)
  //   prop   — значок-реквизит рядом с аватаром (не лицо, может быть пустым)
  //   motion — стиль пассивного движения аватара
  const ACTIVITIES = {
    idle:        { label: "Простаивает",       face: "🙂", prop: "",   motion: "float" },
    talking:     { label: "Общается",          face: "😃", prop: "🎙️", motion: "bob" },
    gaming:      { label: "Играет",            face: "😎", prop: "🎮", motion: "shake" },
    reviewing:   { label: "Обзор",             face: "🧐", prop: "🔍", motion: "lean" },
    thinking:    { label: "Думает",            face: "🤔", prop: "💭", motion: "float" },
    sleeping:    { label: "Спит",              face: "😴", prop: "💤", motion: "sleep" },
    music:       { label: "Слушает музыку",    face: "😌", prop: "🎧", motion: "sway" },
    reading:     { label: "Читает чат",        face: "😊", prop: "💬", motion: "float" },
    celebrating: { label: "Радуется",          face: "🥳", prop: "🎉", motion: "jump" },
  };

  // Эмоции — ВСЕ являются лицами. Перекрывают лицо активности, когда заданы
  // (кроме neutral, при котором показывается лицо активности).
  const EMOTIONS = {
    neutral:   { label: "Спокоен",         emoji: "🙂" },
    happy:     { label: "Рад",             emoji: "😄" },
    excited:   { label: "В восторге",      emoji: "🤩" },
    laughing:  { label: "Смеётся",         emoji: "😂" },
    surprised: { label: "Удивлён",         emoji: "😲" },
    sad:       { label: "Грустит",         emoji: "😢" },
    angry:     { label: "Злится",          emoji: "😠" },
    bored:     { label: "Скучает",         emoji: "😐" },
    love:      { label: "Обожает",         emoji: "😍" },
    confused:  { label: "В замешательстве", emoji: "😕" },
    sleepy:    { label: "Сонный",          emoji: "🥱" },
    cool:      { label: "Крут",            emoji: "😎" },
    wink:      { label: "Подмигивает",     emoji: "😉" },
    thinkface: { label: "Задумался",       emoji: "🤔" },
  };

  function createInitialState() {
    return {
      streamer: {
        name: "DeepStreamer",
        activity: "idle",
        emotion: "neutral",
        mood: 0.6,
        energy: 0.8,
      },
      stats: {
        startedAt: null,
        tick: 0,
        viewers: 0,
        messagesSpoken: 0,
      },
      transcript: [],
      chat: [],
      running: false,
    };
  }

  const EMOTION_HINTS = [
    [/(ха-?ха|ахах|лол|смешно|ржу)/i, "laughing"],
    [/(ого|вот это|ничего себе|вау|обалде)/i, "surprised"],
    [/(круто|класс|супер|отлично|топ|прекрасно)/i, "excited"],
    [/(люблю|обожаю|сердечк|милота)/i, "love"],
    [/(грустн|печаль|жаль|увы)/i, "sad"],
    [/(злюсь|бесит|ненавиж|раздраж)/i, "angry"],
    [/(скучн|зеваю)/i, "bored"],
    [/(думаю|интересно|хм+|наверное)/i, "thinkface"],
    [/(спать|устал|сонн|засыпа)/i, "sleepy"],
  ];

  function guessEmotion(text) {
    for (const [re, emotion] of EMOTION_HINTS) {
      if (re.test(text)) return emotion;
    }
    return "neutral";
  }

  // ВСЕГДА возвращает лицо: эмоция (если задана и не neutral) либо лицо активности.
  function emojiFor(activity, emotion) {
    if (emotion && emotion !== "neutral" && EMOTIONS[emotion]) {
      return EMOTIONS[emotion].emoji;
    }
    if (activity && ACTIVITIES[activity]) return ACTIVITIES[activity].face;
    return "🙂";
  }

  // Реквизит активности (может быть пустым). Показывается ОТДЕЛЬНО от лица.
  function propFor(activity) {
    return (activity && ACTIVITIES[activity]?.prop) || "";
  }

  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  ns.StreamState = {
    ACTIVITIES,
    EMOTIONS,
    createInitialState,
    guessEmotion,
    emojiFor,
    propFor,
  };
})();
