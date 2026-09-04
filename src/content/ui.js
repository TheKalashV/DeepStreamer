// UI стрима — рисует поверх сайта DeepSeek полноэкранный интерфейс
// "DeepSeek Stream": сцена с эмодзи-аватаром, HUD, субтитры и ленту чата.
// Реагирует на события оркестратора.
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
      renderActivities();
      return root;
    }

    function unmount() {
      const existing = document.getElementById(ROOT_ID);
      if (existing) existing.remove();
    }

    function template() {
      return `
        <div class="ds-topbar">
          <div class="ds-brand">
            <span class="ds-live" data-live>● LIVE</span>
            <span class="ds-title">DeepSeek Stream</span>
          </div>
          <div class="ds-hud">
            <span class="ds-hud__item" title="Зрители">👁 <b data-viewers>0</b></span>
            <span class="ds-hud__item" title="Активность">🎬 <b data-activity>—</b></span>
            <span class="ds-hud__item" title="Тик">⏱ <b data-tick>0</b></span>
          </div>
          <div class="ds-controls">
            <button class="ds-btn" data-cmd="toggle">▶ Старт</button>
            <button class="ds-btn ds-btn--ghost" data-cmd="tts" title="Озвучка">🔊</button>
            <button class="ds-btn ds-btn--ghost" data-cmd="subs" title="Субтитры">💬</button>
            <button class="ds-btn ds-btn--ghost" data-cmd="exit" title="Выйти из режима стрима">✕</button>
          </div>
        </div>

        <div class="ds-stage">
          <div class="ds-scene">
            <div class="ds-avatar" data-avatar>
              <div class="ds-avatar__emoji" data-emoji>🙂</div>
              <div class="ds-avatar__shadow"></div>
            </div>
            <div class="ds-emotionbadge" data-emotion></div>
          </div>

          <div class="ds-subtitles" data-subs>
            <span class="ds-subtitles__text" data-subtext></span>
          </div>

          <div class="ds-activitybar" data-activities></div>
        </div>

        <aside class="ds-chat">
          <div class="ds-chat__head">Чат зрителей</div>
          <div class="ds-chat__list" data-chatlist></div>
          <form class="ds-chat__form" data-chatform>
            <input class="ds-chat__input" data-chatinput placeholder="Написать в чат…" maxlength="200" />
            <button class="ds-chat__send" type="submit">→</button>
          </form>
        </aside>
      `;
    }

    function cacheEls(root) {
      els = {
        root,
        live: root.querySelector("[data-live]"),
        viewers: root.querySelector("[data-viewers]"),
        activity: root.querySelector("[data-activity]"),
        tick: root.querySelector("[data-tick]"),
        avatar: root.querySelector("[data-avatar]"),
        emoji: root.querySelector("[data-emoji]"),
        emotion: root.querySelector("[data-emotion]"),
        subs: root.querySelector("[data-subs]"),
        subtext: root.querySelector("[data-subtext]"),
        activities: root.querySelector("[data-activities]"),
        chatlist: root.querySelector("[data-chatlist]"),
        chatform: root.querySelector("[data-chatform]"),
        chatinput: root.querySelector("[data-chatinput]"),
        toggleBtn: root.querySelector('[data-cmd="toggle"]'),
      };
    }

    function bindEvents() {
      els.root.querySelectorAll("[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => onCommand?.(btn.dataset.cmd));
      });
      els.chatform.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = els.chatinput.value.trim();
        if (!text) return;
        els.chatinput.value = "";
        onCommand?.("chat", text);
      });
    }

    function renderActivities() {
      const items = Object.entries(State.ACTIVITIES)
        .map(
          ([key, a]) =>
            `<button class="ds-actchip" data-act="${key}" title="${a.label}">${a.emoji}<span>${a.label}</span></button>`
        )
        .join("");
      els.activities.innerHTML = items;
      els.activities.querySelectorAll("[data-act]").forEach((chip) => {
        chip.addEventListener("click", () => onCommand?.("set-activity", chip.dataset.act));
      });
    }

    // --- Реакции на события оркестратора -----------------------------------
    function onStart() {
      els.toggleBtn.textContent = "⏸ Пауза";
      els.toggleBtn.classList.add("is-live");
      els.live.classList.add("is-on");
    }

    function onStop() {
      els.toggleBtn.textContent = "▶ Старт";
      els.toggleBtn.classList.remove("is-live");
      els.live.classList.remove("is-on");
      setThinking(false);
    }

    function setThinking(on) {
      els.avatar.classList.toggle("is-thinking", !!on);
    }

    function updateHud(state) {
      els.viewers.textContent = state.stats.viewers;
      const act = State.ACTIVITIES[state.streamer.activity];
      els.activity.textContent = act ? act.label : "—";
      els.tick.textContent = state.stats.tick;
      // Подсветить активную активность.
      els.activities.querySelectorAll("[data-act]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.act === state.streamer.activity);
      });
    }

    function updateAvatar(state) {
      const { activity, emotion } = state.streamer;
      els.emoji.textContent = State.emojiFor(activity, emotion);
      // Класс движения по активности.
      const motion = State.ACTIVITIES[activity]?.motion || "float";
      els.avatar.dataset.motion = motion;
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
      line.innerHTML = `<span class="ds-chat__author" style="color:${entry.color}">${escapeHtml(
        entry.author
      )}</span> <span class="ds-chat__text">${escapeHtml(entry.text)}</span>`;
      els.chatlist.appendChild(line);
      // Автоскролл вниз.
      els.chatlist.scrollTop = els.chatlist.scrollHeight;
      while (els.chatlist.children.length > 120) {
        els.chatlist.removeChild(els.chatlist.firstChild);
      }
    }

    function applySettings(next) {
      settings = next;
      els.root.classList.toggle("ds-no-subs", !settings.subtitlesEnabled);
      els.root.querySelector('[data-cmd="tts"]').classList.toggle("is-off", !settings.ttsEnabled);
      els.root.querySelector('[data-cmd="subs"]').classList.toggle("is-off", !settings.subtitlesEnabled);
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
