/* Layout compacto do Pátio: alertas do sistema recolhidos numa linha só. */
(function () {
  'use strict';
  const STORAGE_KEY = 'heilog-system-alerts-open';

  function readOpen() {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }
  function saveOpen(open) {
    try { sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch (_) {}
  }

  function initSystemAlerts() {
    const container = document.getElementById('system-alerts-container');
    if (!container || container.dataset.compactAlerts) return;
    container.dataset.compactAlerts = 'true';
    let open = readOpen();
    let syncing = false;

    const sync = () => {
      if (syncing) return;
      syncing = true;
      try {
        let toggle = container.querySelector(':scope > .sys-alerts-toggle');
        const alerts = [...container.children].filter(child => child !== toggle);
        if (!alerts.length) {
          toggle?.remove();
          container.classList.remove('has-compact-alerts', 'is-collapsed');
          return;
        }
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'sys-alerts-toggle';
          toggle.addEventListener('click', () => {
            open = !open;
            saveOpen(open);
            sync();
          });
        }
        if (container.firstElementChild !== toggle) container.prepend(toggle);
        const count = alerts.length;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
        const label = document.createElement('span');
        label.textContent = `${count} ${count === 1 ? 'alerta do sistema' : 'alertas do sistema'}`;
        const action = document.createElement('u');
        action.textContent = open ? 'ocultar' : 'ver';
        toggle.append(label, action);
        container.classList.add('has-compact-alerts');
        container.classList.toggle('is-collapsed', !open);
      } finally {
        // Ignora as mudanças feitas aqui mesmo.
        observer.takeRecords();
        syncing = false;
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(container, { childList: true });
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSystemAlerts, { once: true });
  } else {
    initSystemAlerts();
  }
})();
