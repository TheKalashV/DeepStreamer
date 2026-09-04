// UI стрима "DeepSeek Stream" — полноэкранный оверлей поверх сайта.
//
// Принципы (по требованиям):
//  - Аватар-ЛИЦО занимает почти весь экран (доминирует на сцене).
//  - Реквизит активности (геймпад, наушники...) — ОТДЕЛЬНЫЙ значок, не лицо.
//  - Чат зрителей — как на Twitch: всегда видим, НЕ сворачивается и не
//    уменьшается пользователем.
//  - Управление (старт/пауза, TTS, субтитры) вынесено в POPUP расширения,
//    на самом сайте кнопок управления НЕТ.
//
// Экспортирует globalThis.DeepStreamer.UI.

(function () {
  const ns = (globalThis.DeepStreamer = globalThis.DeepStreamer || {});
  const State = ns.StreamState;

  const ROOT_ID = "deepstreamer-root";

  function createUI({ settings, onCommand }) {
    let els = {};
    let subtitleTimer = null;

    function mount() {
      unmount();
      const root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "ds-stream";
      root.innerHTML = template();
      document.documentElement.appendChild(root);
      cacheEls(root);
      bindEvents();
      applySettings(settings);
      return root;
    }

    function unmount() {
      const existing = document.getElementById(ROOT_ID);
      if (existing) existing.remove();
    }

    function template() {
      return `
        <section class="ds-stage">
          <div class="ds-statusline">
            <span class="ds-live" data-live>● OFFLINE</span>
            <span class="ds-title">DeepSeek Stream</span>
            <span class="ds-status-meta">
              <span title="Зрители">👁 <b data-viewers>0</b></span>
              <span title="Активность"><b data-activity>—</b></span>
            </span>
          </div>

          <div class="ds-scene">
            <div class="ds-prop" data-prop hidden></div>
            <div class="ds-avatar" data-avatar>
              <div class="ds-avatar__face" data-emoji>🙂</div>
            </div>
            <div class="ds-avatar__shadow"></div>
            <div class="ds-emotionbadge" data-emotion></div>
          </div>

          <div class="ds-subtitles" data-subs>
            <span class="ds-subtitles__text" data-subtext></span>
          </div>
        </section>

        <aside class="ds-chat">
          <div class="ds-chat__head">
            <span>💬 Чат стрима</span>
            <span class="ds-chat__count"><b data-viewers2>0</b> зрителей</span>
          </div>
          <div class="ds-chat__list" data-chatlist></div>
          <form class="ds-chat__form" data-chatform>
            <input class="ds-chat__input" data-chatinput placeholder="Сказать что-нибудь…" maxlength="200" />
            <button class="ds-chat__send" type="submit" title="Отправить">→</button>
          </form>
        </aside>
      `;
    }

    function cacheEls(root) {
      els = {
        root,
        live: root.querySelector("[data-live]"),
        viewers: root.querySelector("[data-viewers]"),
        viewers2: root.querySelector("[data-viewers2]"),
        activity: root.querySelector("[data-activity]"),
        avatar: root.querySelector("[data-avatar]"),
        emoji: root.querySelector("[data-emoji]"),
        prop: root.querySelector("[data-prop]"),
        emotion: root.querySelector("[data-emotion]"),
        subs: root.querySelector("[data-subs]"),
        subtext: root.querySelector("[data-subtext]"),
        chatlist: root.querySelector("[data-chatlist]"),
        chatform: root.querySelector("[data-chatform]"),
        chatinput: root.querySelector("[data-chatinput]"),
      };
    }

    function bindEvents() {
      els.chatform.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = els.chatinput.value.trim();
        if (!text) return;
        els.chatinput.value = "";
        onCommand?.("chat", text);
      });

      // На сайте DeepSeek есть глобальные обработчики клавиш/фокуса, которые
      // могут «перехватывать» ввод в наше поле. Останавливаем всплытие событий
      // клавиатуры от поля чата, чтобы печатать можно было свободно.
      const stop = (e) => e.stopPropagation();
      ["keydown", "keyup", "keypress", "input", "paste"].forEach((evt) => {
        els.chatinput.addEventListener(evt, stop);
      });

      // Enter отправляет (а не переносит строку), не давая сайту перехватить.
      els.chatinput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          els.chatform.requestSubmit
            ? els.chatform.requestSubmit()
            : els.chatform.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });

      // Клик по полю гарантированно ставит фокус (на случай фокус-ловушек сайта).
      els.chatinput.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        setTimeout(() => els.chatinput.focus(), 0);
      });
    }

    // --- Реакции на события оркестратора -----------------------------------
    function onStart() {
      els.live.textContent = "● LIVE";
      els.live.classList.add("is-on");
    }

    function onStop() {
      els.live.textContent = "● OFFLINE";
      els.live.classList.remove("is-on");
      setThinking(false);
    }

    function setThinking(on) {
      els.avatar.classList.toggle("is-thinking", !!on);
    }

    function updateHud(state) {
      els.viewers.textContent = state.stats.viewers;
      if (els.viewers2) els.viewers2.textContent = state.stats.viewers;
      const act = State.ACTIVITIES[state.streamer.activity];
      els.activity.textContent = act ? act.label : "—";
    }

    function updateAvatar(state) {
      const { activity, emotion } = state.streamer;
      // Лицо — всегда лицо.
      els.emoji.textContent = State.emojiFor(activity, emotion);
      // Движение по активности.
      const motion = State.ACTIVITIES[activity]?.motion || "float";
      els.avatar.dataset.motion = motion;
      // Реквизит — отдельным значком (или скрыт).
      const prop = State.propFor(activity);
      if (prop) {
        els.prop.textContent = prop;
        els.prop.hidden = false;
      } else {
        els.prop.hidden = true;
      }
      // Подпись эмоции.
      const em = State.EMOTIONS[emotion];
      els.emotion.textContent = em && emotion !== "neutral" ? em.label : "";
    }

    function showSubtitle(text) {
      if (!settings.subtitlesEnabled) return;
      els.subtext.textContent = text;
      els.subs.classList.add("is-visible");
      clearTimeout(subtitleTimer);
      const dur = Math.min(9000, 2500 + text.length * 60);
      subtitleTimer = setTimeout(() => els.subs.classList.remove("is-visible"), dur);
    }

    function addChat(entry) {
      const line = document.createElement("div");
      line.className = "ds-chat__msg";
      line.innerHTML =
        `<span class="ds-chat__author" style="color:${entry.color}">${escapeHtml(entry.author)}</span>` +
        `<span class="ds-chat__sep">:</span> ` +
        `<span class="ds-chat__text">${escapeHtml(entry.text)}</span>`;
      els.chatlist.appendChild(line);
      els.chatlist.scrollTop = els.chatlist.scrollHeight;
      while (els.chatlist.children.length > 200) {
        els.chatlist.removeChild(els.chatlist.firstChild);
      }
    }

    function applySettings(next) {
      settings = next;
      els.root.classList.toggle("ds-no-subs", !settings.subtitlesEnabled);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[c]));
    }

    return {
      mount,
      unmount,
      onStart,
      onStop,
      setThinking,
      updateHud,
      updateAvatar,
      showSubtitle,
      addChat,
      applySettings,
    };
  }

  ns.UI = { createUI };
})();
