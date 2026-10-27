(() => {
  const TAB_META = {
    "tab-patio": ["Pátio", "Acompanhe as operações do pátio em tempo real."],
    "tab-historico": ["Histórico", "Consulte operações finalizadas e seus registros."],
    "tab-avisos-history": ["Histórico de avisos", "Consulte as resoluções das DTs repetidas."],
    "tab-ocorrencias": ["Ocorrências", "Acompanhe desvios, evidências e tratativas."],
    "tab-performance": ["Performance do turno", "Indicadores e evolução da operação no turno."],
    "tab-motoristas": ["Motoristas", "Cadastro e consulta da base de motoristas."],
    "tab-movimento-dia": ["Movimento do dia", "Chegadas, carregamentos e comparação dos registros SAP e HEILOG."],
    "tab-baldeios": ["Baldeios", "Visão operacional de baldeios e prioridades."],
    "tab-ritmo": ["Controle de Baldeios", "Ritmo, placas e direcionamento da operação."],
    "tab-controle-dt": ["Controle de DTs", "Programação, reserva e acompanhamento de DTs."],
    "tab-drop-dashboard": ["Painel de fluxo", "Acompanhe as DTs por etapa e o tempo da operação."],
    "tab-drop-panel": ["Painel Drop & Hook", "Controle das carretas em fluxo e aguardando atrelar."],
    "tab-dashboard": ["Dashboard", "Visão consolidada dos indicadores operacionais."],
    "tab-pandora": ["Pandora", "Gestão de notas fiscais, aging e status fiscal."]
  };

  const ACTION_LABELS = {
    whatsapp: "Chamar no WhatsApp",
    "sap-whatsapp": "Chamar no WhatsApp",
    "reprint-sheet": "Reimprimir folha",
    details: "Linha do tempo",
    occurrence: "Abrir ocorrência",
    finish: "Finalizar operação",
    cancel: "Cancelar / desfazer",
    "edit-occurrence": "Ver ou editar resolução",
    "view-occurrence-images": "Ver evidências"
  };

  function activePanelTab() {
    return document.querySelector("#panel-tabs-wrap .tab-btn.active-tab") ||
      document.getElementById("tab-patio");
  }

  function updateHero(tab = activePanelTab()) {
    const title = document.getElementById("app-v2-page-title");
    const subtitle = document.getElementById("app-v2-page-subtitle");
    const tableTitle = document.getElementById("table-title");
    const activeTabId = tab?.id || "tab-patio";
    document.body.dataset.activePanelTab = activeTabId.replace(/^tab-/, "");
    const meta = TAB_META[tab?.id] || [
      tableTitle?.textContent?.trim() || "Painel do Analista",
      "Central de controle operacional."
    ];
    if (title) title.textContent = meta[0];
    if (subtitle) subtitle.textContent = meta[1];
  }

  function addNavigationSections(nav) {
    const sections = [
      ["tab-patio", "Operação"],
      ["tab-performance", "Desempenho"],
      ["tab-controle-dt", "Controles"],
      ["tab-drop-panel", "Drop & Hook"],
      ["tab-dashboard", "Gestão"]
    ];

    sections.forEach(([id, label]) => {
      const tab = document.getElementById(id);
      if (!tab || tab.previousElementSibling?.classList.contains("app-nav-section")) return;
      const section = document.createElement("div");
      section.className = "app-nav-section";
      section.textContent = label;
      nav.insertBefore(section, tab);
    });
  }

  function ensureActionLabels(button) {
    const action = button.dataset.action;
    const label = ACTION_LABELS[action] || button.title || "Abrir";
    let span = button.querySelector(".table-action-label");
    if (!span) {
      span = document.createElement("span");
      span.className = "table-action-label app-v2-action-label";
      button.appendChild(span);
    }
    span.textContent = label;
  }

  function enhanceActionMenus(root = document) {
    root.querySelectorAll(".action-cell-inner:not([data-app-actions-ready])").forEach((container) => {
      container.dataset.appActionsReady = "true";
      const actions = Array.from(container.querySelectorAll(".table-action-btn"));
      if (!actions.length) return;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mobile-actions-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `
        <span>Ações</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

      const menu = document.createElement("div");
      menu.className = "mobile-actions-menu";
      actions.forEach((button) => {
        ensureActionLabels(button);
        menu.appendChild(button);
      });
      container.append(toggle, menu);
    });
  }

  function closeActionMenus(except = null) {
    document.querySelectorAll(".action-cell-inner.is-open").forEach((menu) => {
      if (menu === except) return;
      menu.classList.remove("is-open");
      menu.querySelector(".mobile-actions-toggle")?.setAttribute("aria-expanded", "false");
    });
  }

  function initHeaderUtilities(header) {
    const clock = header.querySelector('#heilog-header-clock');
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const updateClock = () => {
      const now = new Date();
      if (clock) {
        clock.textContent = formatter.format(now);
        clock.dateTime = now.toISOString();
      }
    };
    updateClock();
    if (clock) setInterval(updateClock, 1000);
    document.addEventListener('visibilitychange', updateClock);

    const settings = header.querySelector('#heilog-header-settings');
    const button = header.querySelector('#heilog-settings-btn');
    const panel = header.querySelector('#heilog-settings-panel');
    if (!settings || !button || !panel) return;
    const close = () => {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    panel.addEventListener('click', event => {
      if (event.target.closest('button')) close();
    });
    document.addEventListener('click', event => {
      if (!settings.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        close();
        button.focus();
      }
    });
    settings.addEventListener('focusout', event => {
      if (!settings.contains(event.relatedTarget)) close();
    });
  }

  function init() {
    const root = document.querySelector("body > div.w-full.min-h-screen");
    const header = root?.querySelector(".site-header");
    const tabsWrap = document.getElementById("panel-tabs-wrap");
    const mainContent = document.getElementById("main-content");
    if (!root || !header || !tabsWrap || !mainContent || root.dataset.appV2Ready) return;

    root.dataset.appV2Ready = "true";
    root.id = "heilog-app-root-v2";
    root.className = "heilog-app-root-v2";
    document.body.classList.add("heilog-app-v2");

    const originalChildren = Array.from(root.childNodes);
    const workspace = document.createElement("section");
    workspace.className = "heilog-app-workspace";
    originalChildren.forEach((node) => workspace.appendChild(node));

    const sidebar = document.createElement("aside");
    sidebar.className = "heilog-app-sidebar";
    sidebar.setAttribute("aria-label", "Navegação principal");
    sidebar.innerHTML = `
      <div class="app-sidebar-brand">
        <img src="./assets/heilog-header-49e8b3b67195.webp" alt="HEILOG">
        <button type="button" class="app-sidebar-collapse" aria-label="Recolher menu" title="Recolher menu">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="app-sidebar-scroll">
        <div class="app-sidebar-nav"></div>
      </div>
      <div class="app-sidebar-foot">
        <span class="app-live-dot"></span>
        <span class="app-sidebar-foot-label">Tempo real ativo</span>
      </div>`;

    root.append(sidebar, workspace);
    const sidebarNav = sidebar.querySelector(".app-sidebar-nav");
    sidebarNav.appendChild(tabsWrap);
    const nav = tabsWrap.querySelector("nav");
    addNavigationSections(nav);

    const hero = document.createElement("section");
    hero.className = "app-v2-hero";
    hero.innerHTML = `
      <div class="app-v2-hero-copy">
        <p class="app-v2-eyebrow">Central de controle operacional</p>
        <h2 id="app-v2-page-title">Pátio</h2>
        <p id="app-v2-page-subtitle">Acompanhe as operações do pátio em tempo real.</p>
      </div>
      <div class="app-v2-hero-actions"></div>`;
    header.insertAdjacentElement("afterend", hero);

    const heroActions = hero.querySelector(".app-v2-hero-actions");
    const exportButton = document.getElementById("export-csv-btn");
    const massFinishButton = document.getElementById("mass-finish-btn");
    if (exportButton) {
      exportButton.classList.add("app-v2-export-action");
      heroActions.appendChild(exportButton);
    }
    if (massFinishButton) {
      massFinishButton.classList.add("app-v2-primary-action");
      heroActions.appendChild(massFinishButton);
    }

    const livePill = document.createElement("div");
    livePill.className = "app-v2-live-pill";
    livePill.title = 'Horário de Brasília';
    livePill.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><time id="heilog-header-clock" aria-label="Horário de Brasília">--:--:--</time>`;
    header.querySelector(".top-actions")?.prepend(livePill);
    initHeaderUtilities(header);

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "app-mobile-menu";
    menuButton.setAttribute("aria-label", "Abrir menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    header.querySelector(".site-header-main")?.prepend(menuButton);

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "app-sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Fechar menu");
    root.appendChild(backdrop);

    const collapseButton = sidebar.querySelector(".app-sidebar-collapse");
    const savedCollapsed = localStorage.getItem("heilog-app-sidebar-collapsed") === "1";
    root.classList.toggle("sidebar-collapsed", savedCollapsed);
    collapseButton?.setAttribute("aria-label", savedCollapsed ? "Expandir menu" : "Recolher menu");
    collapseButton?.setAttribute("title", savedCollapsed ? "Expandir menu" : "Recolher menu");

    collapseButton?.addEventListener("click", () => {
      const collapsed = root.classList.toggle("sidebar-collapsed");
      localStorage.setItem("heilog-app-sidebar-collapsed", collapsed ? "1" : "0");
      collapseButton.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
      collapseButton.setAttribute("title", collapsed ? "Expandir menu" : "Recolher menu");
    });

    const closeMobileMenu = () => {
      document.body.classList.remove("app-sidebar-open");
      menuButton.setAttribute("aria-expanded", "false");
    };
    menuButton.addEventListener("click", () => {
      const open = document.body.classList.toggle("app-sidebar-open");
      menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    });
    backdrop.addEventListener("click", closeMobileMenu);

    nav.querySelectorAll(".tab-btn").forEach((tab) => {
      const label = tab.querySelector("span")?.textContent?.trim() || tab.textContent?.trim();
      tab.title = label;
      tab.addEventListener("click", () => {
        updateHero(tab);
        if (window.matchMedia("(max-width: 900px)").matches) closeMobileMenu();
      });
    });

    const tableBody = document.getElementById("table-body");
    if (tableBody) {
      const observer = new MutationObserver(records => {
        if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&
          (node.matches('.action-cell-inner,tr,td')||node.querySelector('.action-cell-inner')))))enhanceActionMenus(tableBody);
      });
      observer.observe(tableBody, { childList: true, subtree: true });
      enhanceActionMenus(tableBody);
    }

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const toggle = target.closest(".mobile-actions-toggle");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const container = toggle.closest(".action-cell-inner");
        const willOpen = !container.classList.contains("is-open");
        closeActionMenus(container);
        container.classList.toggle("is-open", willOpen);
        toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        return;
      }
      if (!target.closest(".action-cell-inner")) closeActionMenus();
    });

    updateHero();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
