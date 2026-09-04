// Модель состояния ИИ-стримера ("мозг" живёт в JS, не в модели).
// Определяет активности, эмоции и их визуальное представление эмодзи.
// Экспортирует globalThis.DeepStreamer.StreamState.

(function () {
  // Активности стримера. Каждая задаёт базовый эмодзи и стиль движения.
  const ACTIVITIES = {
    idle: { label: "Простаивает", emoji: "🙂", motion: "float" },
    talking: { label: "Общается", emoji: "🗣️", motion: "bob" },
    gaming: { label: "Играет", emoji: "🎮", motion: "shake" },
    reviewing: { label: "Обзор", emoji: "🔍", motion: "lean" },
    thinking: { label: "Думает", emoji: "🤔", motion: "float" },
    sleeping: { label: "Спит", emoji: "😴", motion: "sleep" },
    music: { label: "Слушает музыку", emoji: "🎧", motion: "sway" },
    reading: { label: "Читает чат", emoji: "👀", motion: "scan" },
    celebrating: { label: "Радуется", emoji: "🎉", motion: "jump" },
  };

  // Эмоции: перекрывают эмодзи активности, когда заданы.
  const EMOTIONS = {
    neutral: { label: "Спокоен", emoji: "🙂" },
    happy: { label: "Рад", emoji: "😄" },
    excited: { label: "В восторге", emoji: "🤩" },
    laughing: { label: "Смеётся", emoji: "😂" },
    surprised: { label: "Удивлён", emoji: "😲" },
    sad: { label: "Грустит", emoji: "😢" },
    angry: { label: "Злится", emoji: "😠" },
    bored: { label: "Скучает", emoji: "😐" },
    love: { label: "Обожает", emoji: "😍" },
    confused: { label: "В замешательстве", emoji: "😕" },
    sleepy: { label: "Сонный", emoji: "🥱" },
    cool: { label: "Крут", emoji: "😎" },
  };

  function createInitialState() {
    return {
      streamer: {
        name: "DeepStreamer",
        activity: "idle",
        emotion: "neutral",
        mood: 0.6, // 0..1 общее настроение
        energy: 0.8, // 0..1 бодрость (падает → сон)
      },
      stats: {
        startedAt: null,
        tick: 0,
        viewers: 0,
        messagesSpoken: 0,
      },
      // Последние реплики стримера (речь).
      transcript: [], // { id, text, ts, emotion, activity }
      // Лента чата зрителей.
      chat: [], // { id, author, text, ts, color }
      running: false,
    };
  }

  // Ключевые слова → эмоция (простой детектор для mock-режима и подсказок).
  const EMOTION_HINTS = [
    [/(ха-?ха|ахах|лол|смешно|ржу)/i, "laughing"],
    [/(ого|вот это|ничего себе|вау|обалде)/i, "surprised"],
    [/(круто|класс|супер|отлично|топ|прекрасно)/i, "excited"],
    [/(люблю|обожаю|сердечк|милота)/i, "love"],
    [/(грустн|печаль|жаль|увы)/i, "sad"],
    [/(злюсь|бесит|ненавиж|раздраж)/i, "angry"],
    [/(скучн|зеваю|устал)/i, "bored"],
    [/(думаю|интересно|хм+|наверное)/i, "confused"],
    [/(спать|устал|сонн|засыпа)/i, "sleepy"],
  ];

  function guessEmotion(text) {
    for (const [re, emotion] of EMOTION_HINTS) {
      if (re.test(text)) return emotion;
    }
    return "neutral";
  }

  function emojiFor(activity, emotion) {
    if (emotion && emotion !== "neutral" && EMOTIONS[emotion]) {
      return EMOTIONS[emotion].emoji;
    }
    if (activity && ACTIVITIES[activity]) return ACTIVITIES[activity].emoji;
    return "🙂";
  }

  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  ns.StreamState = {
    ACTIVITIES,
    EMOTIONS,
    createInitialState,
    guessEmotion,
    emojiFor,
  };
})();
