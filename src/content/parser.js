// Parser — разбирает ответ модели в структуру {text, emotion, activity}.
// Модель может обернуть JSON в markdown, добавить текст до/после и т.п.,
// поэтому парсер "оборонительный": ищет JSON, а при неудаче делает fallback
// на обычный текст + эвристику эмоции.
//
// Экспортирует globalThis.DeepStreamer.Parser.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});

  function extractJson(raw) {
    if (!raw) return null;
    // Убираем markdown-ограждения ```json ... ```
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : raw;
    // Берём первую сбалансированную {...} область.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = candidate.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }

  function normalizeActivity(a) {
    if (a && ns.StreamState.ACTIVITIES[a]) return a;
    return null;
  }

  function normalizeEmotion(e) {
    if (e && ns.StreamState.EMOTIONS[e]) return e;
    return null;
  }

  function parse(raw) {
    const obj = extractJson(raw);
    if (obj && typeof obj.say === "string") {
      return {
        text: obj.say.trim(),
        emotion: normalizeEmotion(obj.emotion) || ns.StreamState.guessEmotion(obj.say),
        activity: normalizeActivity(obj.activity),
      };
    }
    // Fallback: чистый текст.
    const text = (raw || "").trim();
    return {
      text,
      emotion: ns.StreamState.guessEmotion(text),
      activity: null,
    };
  }

  ns.Parser = { parse, extractJson };
})();
