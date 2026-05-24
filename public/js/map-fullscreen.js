// ===== Map fullscreen + edge flyout panels =====
const MapFullscreen = {
  stage: null,
  EDGE_PX: 32,
  hold: { left: false, right: false, top: false },
  edge: { left: false, right: false, top: false },

  init() {
    this.stage = document.getElementById('map-stage');
    if (!this.stage) return;

    document.getElementById('btn-map-fullscreen')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-map-fullscreen-header')?.addEventListener('click', () => this.toggle());

    document.addEventListener('fullscreenchange', () => this.syncState());
    document.addEventListener('keydown', (e) => this.onKeydown(e));

    this.stage.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.stage.addEventListener('mouseleave', () => this.clearEdgeHover());

    this.stage.querySelectorAll('.map-fs-panel').forEach((panel) => {
      panel.addEventListener('mouseenter', () => this.setHoldForPanel(panel, true));
      panel.addEventListener('mouseleave', () => this.setHoldForPanel(panel, false));
    });
  },

  isMapTabActive() {
    return document.getElementById('map-panel')?.classList.contains('active');
  },

  isActive() {
    return this.stage?.classList.contains('map-fs-active');
  },

  onKeydown(e) {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (!this.isMapTabActive()) return;
    e.preventDefault();
    this.toggle();
  },

  async toggle() {
    if (!this.stage) return;
    if (document.fullscreenElement === this.stage) {
      await document.exitFullscreen().catch(() => this.setActive(false));
      return;
    }
    if (this.isActive()) {
      this.setActive(false);
      return;
    }
    try {
      await this.stage.requestFullscreen();
    } catch {
      this.setActive(true);
    }
  },

  syncState() {
    const on = document.fullscreenElement === this.stage;
    this.setActive(on);
  },

  setActive(on) {
    if (!this.stage) return;
    this.stage.classList.toggle('map-fs-active', on);
    document.body.classList.toggle('map-fs-mode', on);
    const btn = document.getElementById('btn-map-fullscreen');
    const btn2 = document.getElementById('btn-map-fullscreen-header');
    const label = on ? '✕ Wyjdź' : '⛶';
    if (btn) {
      btn.textContent = on ? '✕' : '⛶';
      btn.title = on ? 'Wyjdź z pełnego ekranu (F / Esc)' : 'Pełny ekran mapy (F)';
    }
    if (btn2) btn2.textContent = on ? '✕ Wyjdź z pełnego ekranu' : '⛶ Pełny ekran';

    if (!on) {
      this.clearEdgeHover();
      this.hold = { left: false, right: false, top: false };
    }
    this.applyEdgeClasses();
    setTimeout(() => {
      if (typeof BattleMap !== 'undefined' && BattleMap.viewport) {
        BattleMap.viewport.dispatchEvent(new Event('scroll'));
      }
    }, 80);
  },

  panelSide(panel) {
    if (panel.classList.contains('map-fs-panel-left')) return 'left';
    if (panel.classList.contains('map-fs-panel-right')) return 'right';
    if (panel.classList.contains('map-fs-panel-top')) return 'top';
    return null;
  },

  setHoldForPanel(panel, on) {
    const side = this.panelSide(panel);
    if (!side) return;
    this.hold[side] = on;
    this.applyEdgeClasses();
  },

  onMouseMove(e) {
    if (!this.isActive()) return;
    const rect = this.stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    this.edge.left = x < this.EDGE_PX;
    this.edge.right = x > w - this.EDGE_PX;
    this.edge.top = y < this.EDGE_PX;
    this.applyEdgeClasses();
  },

  clearEdgeHover() {
    this.edge = { left: false, right: false, top: false };
    this.applyEdgeClasses();
  },

  applyEdgeClasses() {
    if (!this.stage) return;
    const showLeft = this.edge.left || this.hold.left;
    const showRight = this.edge.right || this.hold.right;
    const showTop = this.edge.top || this.hold.top;
    this.stage.classList.toggle('fs-edge-left', showLeft);
    this.stage.classList.toggle('fs-edge-right', showRight);
    this.stage.classList.toggle('fs-edge-top', showTop);
  }
};
