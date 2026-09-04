// Демо-обвязка: встраивает реальную разметку popup в страницу и запускает
// настоящий popup.js в том же контексте (с общим chrome-стабом), чтобы демо
// в точности повторяло панель управления расширения. НЕ входит в расширение.

(function () {
  const mount = document.getElementById("popup-mount");
  const toggleBtn = document.getElementById("demo-toggle");
  const panel = document.getElementById("demo-controls");

  // Подключаем стили popup.
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../src/popup/popup.css";
  document.head.appendChild(link);

  // Разметка popup (синхронизирована с src/popup/popup.html).
  mount.innerHTML = `
    <div style="width:320px;background:#16161c;border-radius:12px;overflow:hidden">
      <header class="ds-header">
        <div class="ds-logo">DeepStreamer</div>
        <div class="ds-version" id="version"></div>
        <button id="closePanel" title="Свернуть"
          style="margin-left:8px;background:none;border:none;color:#9a9aa2;font-size:16px;cursor:pointer">×</button>
      </header>
      <main class="ds-main">
        <button class="ds-primary" id="toggle" disabled>▶ Запустить стрим</button>
        <div class="ds-statusrow">
          <span class="ds-dot" id="statusDot"></span>
          <span id="statusText">…</span>
        </div>
        <div class="ds-grid">
          <label class="ds-toggle"><input type="checkbox" id="enabled" /><span>Режим стрима</span></label>
          <label class="ds-toggle"><input type="checkbox" id="ttsEnabled" /><span>Озвучка (TTS)</span></label>
          <label class="ds-toggle"><input type="checkbox" id="subtitlesEnabled" /><span>Субтитры</span></label>
          <label class="ds-toggle"><input type="checkbox" id="autoStart" /><span>Автостарт</span></label>
        </div>
        <div class="ds-field">
          <label for="engineMode">Источник реплик</label>
          <select id="engineMode">
            <option value="mock">Демо (локально)</option>
            <option value="live">DeepSeek (через сайт)</option>
          </select>
        </div>
        <div class="ds-field"><label for="activity">Активность</label><select id="activity"></select></div>
        <div class="ds-field"><label for="ttsVoice">Голос</label><select id="ttsVoice"><option value="">По умолчанию</option></select></div>
        <div class="ds-field">
          <label for="loopIntervalMs">Пауза между репликами: <b id="loopVal">6.0</b> c</label>
          <input type="range" id="loopIntervalMs" min="2000" max="15000" step="500" />
        </div>
        <details class="ds-diag" id="diag">
          <summary>Диагностика сайта</summary>
          <div class="ds-diag__body" id="diagBody">—</div>
          <button class="ds-mini" id="reprobe">Пересканировать</button>
        </details>
      </main>
      <footer class="ds-footer"><span id="hint" class="ds-hint"></span></footer>
    </div>
  `;

  // Сворачивание/разворачивание панели.
  document.getElementById("closePanel").addEventListener("click", () => {
    panel.style.display = "none";
    toggleBtn.style.display = "block";
  });
  toggleBtn.addEventListener("click", () => {
    panel.style.display = "block";
    toggleBtn.style.display = "none";
  });

  // В демо активная вкладка "deepseek" уже застаблена; content script на этой
  // же странице. Запускаем настоящий popup.js.
  const s = document.createElement("script");
  s.src = "../src/popup/popup.js";
  document.body.appendChild(s);
})();
