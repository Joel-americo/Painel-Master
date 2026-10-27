(function (root) {
  'use strict';
  root.createHeilogIdleSession = function ({ storage, now = Date.now, expire, idleMs = 2 * 60 * 60 * 1000 }) {
    let uid = '', lastWrite = 0, expired = false;
    const keyFor = id => 'heilog-session-activity-v1:' + id;
    function read() {
      try { return Number(storage.getItem(keyFor(uid))) || 0; } catch (_) { return lastWrite; }
    }
    function write(time) {
      lastWrite = time;
      try { storage.setItem(keyFor(uid), String(time)); } catch (_) {}
    }
    function check() {
      if (!uid || expired) return false;
      const time = now(), last = read();
      if (last && time - last >= idleMs) {
        expired = true;
        expire();
        return false;
      }
      return true;
    }
    return {
      start(id, fresh = false) {
        uid = String(id || ''); expired = false; lastWrite = 0;
        if (!uid) return false;
        if (fresh || !read()) write(now());
        return check();
      },
      stop() { uid = ''; expired = false; lastWrite = 0; },
      check,
      activity() {
        if (!check()) return;
        const time = now();
        if (time - lastWrite >= 10000) write(time);
      },
      storageChanged(key) { if (uid && key === keyFor(uid)) check(); }
    };
  };
})(window);
