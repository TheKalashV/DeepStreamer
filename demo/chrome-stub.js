// Минимальный стаб chrome.* API для запуска модулей расширения на обычной
// веб-странице (демо/превью). НЕ входит в само расширение.

(function () {
  const store = {};

  function get(keys) {
    let result = {};
    if (keys == null) result = { ...store };
    else if (typeof keys === "string") result[keys] = store[keys];
    else if (Array.isArray(keys)) keys.forEach((k) => (result[k] = store[k]));
    else result = { ...keys, ...pick(store, Object.keys(keys)) };
    return Promise.resolve(result);
  }

  function pick(obj, keys) {
    const o = {};
    keys.forEach((k) => (o[k] = obj[k]));
    return o;
  }

  const listeners = [];

  function set(items) {
    const changes = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: store[k], newValue: v };
      store[k] = v;
    }
    listeners.forEach((fn) => fn(changes, "sync"));
    return Promise.resolve();
  }

  window.chrome = {
    storage: {
      sync: { get, set },
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    runtime: {
      getManifest: () => ({ version: "0.1.0" }),
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      sendMessage: () => {},
    },
  };
})();
