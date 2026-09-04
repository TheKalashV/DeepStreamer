// Content script для сайта DeepSeek.
// Здесь будет основная логика реворка интерфейса.
//
// Важное про архитектуру:
//  - DeepSeek — SPA, DOM перерисовывается динамически, поэтому изменения
//    навешиваем через MutationObserver, а не одноразово при загрузке.
//  - Все визуальные правки помечаем атрибутом data-deepstreamer, чтобы
//    легко находить/откатывать их и не применять дважды.
//  - Файл settings.js подключается перед content.js (см. manifest.json),
//    поэтому доступен через globalThis.DeepStreamer.Settings.

(function () {
  const { getSettings, onSettingsChanged } = globalThis.DeepStreamer.Settings;

  const ROOT_ATTR = "data-deepstreamer";
  const ROOT_FLAG = "ds-active";

  let settings = null;
  let rafId = null;

  /** Отметить <html>, чтобы CSS-правила расширения активировались. */
  function applyRootState() {
    const root = document.documentElement;
    if (settings?.enabled) {
      root.setAttribute(ROOT_ATTR, ROOT_FLAG);
    } else {
      root.removeAttribute(ROOT_ATTR);
    }
  }

  /**
   * Точка приложения изменений к DOM. Вызывается при инициализации
   * и на каждое существенное изменение страницы.
   */
  function enhance() {
    if (!settings?.enabled) return;
    // TODO: сюда добавим конкретные фичи реворка.
  }

  function scheduleEnhance() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      enhance();
    });
  }

  /** Наблюдаем за перерисовками SPA. */
  function startObserver() {
    const observer = new MutationObserver(() => scheduleEnhance());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    settings = await getSettings();
    applyRootState();
    enhance();
    startObserver();

    onSettingsChanged((next) => {
      settings = next;
      applyRootState();
      enhance();
    });

    console.log("[DeepStreamer] content script активен");
  }

  init();
})();
