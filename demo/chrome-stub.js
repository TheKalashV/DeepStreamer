// Минимальный стаб chrome.* API для запуска модулей расширения на обычной
// веб-странице (демо/превью). НЕ входит в само расширение.

(function () {
  const store = {};
  const storageListeners = [];
  const messageListeners = [];

  function get(keys) {
    let result = {};
    if (keys == null) result = { ...store };
    else if (typeof keys === "string") result[keys] = store[keys];
    else if (Array.isArray(keys)) keys.forEach((k) => (result[k] = store[k]));
    else {
      for (const k of Object.keys(keys)) result[k] = k in store ? store[k] : keys[k];
    }
    return Promise.resolve(result);
  }

  function set(items) {
    const changes = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: store[k], newValue: v };
      store[k] = v;
    }
    storageListeners.forEach((fn) => fn(changes, "sync"));
    return Promise.resolve();
  }

  // Локальная доставка сообщений между "popup" и "content" в одной странице.
  function dispatchMessage(msg) {
    return new Promise((resolve) => {
      let answered = false;
      const sendResponse = (r) => {
        if (!answered) {
          answered = true;
          resolve(r);
        }
      };
      for (const fn of messageListeners) {
        const ret = fn(msg, { id: "demo" }, sendResponse);
        if (ret === true) return; // ответит асинхронно
      }
      if (!answered) resolve(undefined);
    });
  }

  window.chrome = {
    storage: {
      sync: { get, set },
      onChanged: {
        addListener: (fn) => storageListeners.push(fn),
        removeListener: (fn) => {
          const i = storageListeners.indexOf(fn);
          if (i >= 0) storageListeners.splice(i, 1);
        },
      },
    },
    runtime: {
      getManifest: () => ({ version: "0.2.0" }),
      onMessage: {
        addListener: (fn) => messageListeners.push(fn),
        removeListener: () => {},
      },
      sendMessage: (msg) => dispatchMessage(msg),
      onInstalled: { addListener: () => {} },
    },
    tabs: {
      query: () =>
        Promise.resolve([{ id: 1, url: "https://chat.deepseek.com/", active: true }]),
      sendMessage: (_id, msg) => dispatchMessage(msg),
    },
  };
})();
