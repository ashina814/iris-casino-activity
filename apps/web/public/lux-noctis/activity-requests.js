(function () {
  const storageKey = "iris-activity-pending-requests-v1";

  function read() {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function write(value) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  }

  function begin(key, create) {
    const pending = read();
    if (pending[key]) return pending[key];
    const value = create();
    pending[key] = value;
    write(pending);
    return value;
  }

  function complete(key, id) {
    const pending = read();
    if (!pending[key] || (id && pending[key].id !== id)) return;
    delete pending[key];
    write(pending);
  }

  window.__IRIS_ACTIVITY_REQUESTS__ = { begin, complete };
})();
