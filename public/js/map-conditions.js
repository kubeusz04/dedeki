// ===== Map Token Conditions (5e) =====
// Stany umieszczane na tokenach. Renderowane jako emojiki obracające się
// wokół tokena, z licznikiem rund pozostałych do wygaśnięcia.
const MapConditions = {
  CATALOG: [
    { id: 'poisoned',     name: 'Zatruty',         emoji: '🤢', color: '#7cc55a', desc: 'Utrudnienie na ataki i testy zdolności.' },
    { id: 'paralyzed',    name: 'Sparaliżowany',   emoji: '⚡', color: '#f0c020', desc: 'Niezdolny do akcji; ataki krytyczne ze zwarcia.' },
    { id: 'prone',        name: 'Powalony',        emoji: '🛌', color: '#a86d3a', desc: 'Pełzanie kosztuje x2; utrudnienie na ataki dystansowe.' },
    { id: 'stunned',      name: 'Oszołomiony',     emoji: '😵', color: '#d4a72c', desc: 'Niezdolny do ruchu/akcji; STR/DEX = 0.' },
    { id: 'unconscious',  name: 'Nieprzytomny',    emoji: '😴', color: '#8a6dff', desc: 'Niezdolny; upada na ziemię; krytyki ze zwarcia.' },
    { id: 'frightened',   name: 'Przerażony',      emoji: '😱', color: '#9b59b6', desc: 'Utrudnienie testów gdy źródło widoczne.' },
    { id: 'blinded',      name: 'Niewidomy',       emoji: '🚫', color: '#7f8c8d', desc: 'Nie widzi; utrudnienie ataków.' },
    { id: 'deafened',     name: 'Głuchy',          emoji: '🔇', color: '#7f8c8d', desc: 'Nie słyszy; oblanie testów na słuch.' },
    { id: 'charmed',      name: 'Zauroczony',      emoji: '💖', color: '#ec5b9b', desc: 'Nie atakuje czarującego; ten ma przewagę na interakcje.' },
    { id: 'grappled',     name: 'Pochwycony',      emoji: '🤚', color: '#a55a3c', desc: 'Prędkość 0; do końca chwytu.' },
    { id: 'restrained',   name: 'Skrępowany',      emoji: '🪢', color: '#a55a3c', desc: 'Prędkość 0; utrudnienie ataków/DEX save.' },
    { id: 'incapacitated',name: 'Niedołężny',      emoji: '❌', color: '#888', desc: 'Bez akcji ani reakcji.' },
    { id: 'invisible',    name: 'Niewidzialny',    emoji: '👻', color: '#9bd9ff', desc: 'Przewaga na ataki; wrogowie utrudnione ataki.' },
    { id: 'petrified',    name: 'Skamieniały',     emoji: '🗿', color: '#888', desc: 'Zamieniony w kamień; odporny na większość obrażeń.' },
    { id: 'exhaustion',   name: 'Wyczerpanie',     emoji: '💀', color: '#666', desc: 'Poziom 1–6: kumulacja kar (zob. PHB).' },
    // Niestandardowe efekty stref / czarów (bardzo przydatne)
    { id: 'burning',      name: 'Płonący',         emoji: '🔥', color: '#e74c3c', desc: 'Płonie — obrażenia ognia co turę.' },
    { id: 'bleeding',     name: 'Krwawienie',      emoji: '🩸', color: '#c0392b', desc: 'Krwawi — obrażenia co turę.' },
    { id: 'frozen',       name: 'Zamrożony',       emoji: '🧊', color: '#5dade2', desc: 'Spowolnienie / unieruchomienie.' },
    { id: 'concentrating',name: 'Koncentracja',    emoji: '🧠', color: '#3498db', desc: 'Utrzymuje czar — ST CON przy obrażeniach.' },
    { id: 'blessed',      name: 'Błogosławiony',   emoji: '🛡️', color: '#f1c40f', desc: '+1k4 do ataków i ST.' },
    { id: 'hasted',       name: 'Pośpieszony',     emoji: '💨', color: '#2ecc71', desc: 'Podwójna prędkość, +2 KP, +1 atak.' },
    { id: 'slowed',       name: 'Spowolniony',     emoji: '🐌', color: '#7f8c8d', desc: 'Połowa prędkości, -2 KP/DEX save.' },
    { id: 'silenced',     name: 'Niemy',           emoji: '🤐', color: '#7f8c8d', desc: 'Brak czarów werbalnych.' },
    { id: 'marked',       name: 'Oznaczony',       emoji: '🎯', color: '#e67e22', desc: 'Łowca/ryt: +1d6 obrażeń.' },
    { id: 'inspired',     name: 'Inspiracja barda',emoji: '🎵', color: '#9b59b6', desc: '+1k* do testu (zużywalne).' }
  ],

  byId(id) {
    return this.CATALOG.find((c) => c.id === id) || null;
  },

  // ===== Stan animacji =====
  _animating: false,
  _animFrame: null,

  startAnimation() {
    if (this._animating) return;
    this._animating = true;
    const tick = () => {
      if (!this._animating) return;
      // tylko jeśli na mapie są jakieś stany na widocznych tokenach
      if (typeof BattleMap !== 'undefined' && this._anyConditionsPresent()) {
        BattleMap.scheduleRender();
      }
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  },

  stopAnimation() {
    this._animating = false;
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
  },

  _anyConditionsPresent() {
    if (typeof BattleMap === 'undefined') return false;
    const tokens = BattleMap.tokens || [];
    for (const t of tokens) {
      if (this.parseConditions(t).length) return true;
    }
    return false;
  },

  // ===== Parsowanie =====
  parseConditions(token) {
    if (!token) return [];
    let arr;
    try { arr = typeof token.conditions === 'string' ? JSON.parse(token.conditions || '[]') : (token.conditions || []); }
    catch { arr = []; }
    if (!Array.isArray(arr)) return [];
    return arr.filter((c) => c && c.id).map((c) => {
      const cat = this.byId(c.id);
      return {
        id: c.id,
        name: c.name || cat?.name || c.id,
        emoji: c.emoji || cat?.emoji || '⚠️',
        color: c.color || cat?.color || '#888',
        durationLeft: c.durationLeft == null ? null : Math.max(0, parseInt(c.durationLeft, 10) || 0),
        notes: c.notes || ''
      };
    });
  },

  // ===== Render: ikony obracające się wokół tokenu =====
  drawForToken(ctx, token) {
    const conditions = this.parseConditions(token);
    if (!conditions.length) return;

    const tl = typeof BattleMap !== 'undefined' && BattleMap.cellTopLeftPx
      ? BattleMap.cellTopLeftPx(token.x, token.y)
      : { x: token.x * 40, y: token.y * 40 };
    const tx = tl.x;
    const ty = tl.y;
    const cell = typeof BattleMap !== 'undefined' && BattleMap.cellSizePx
      ? BattleMap.cellSizePx()
      : { w: 40, h: 40 };
    const sizeW = (token.size || 1) * cell.w;
    const sizeH = (token.size || 1) * cell.h;
    const cx = tx + sizeW / 2;
    const cy = ty + sizeH / 2;
    const radius = Math.max(sizeW, sizeH) / 2 + Math.max(8, Math.min(cell.w, cell.h) * 0.18);
    const iconSize = Math.max(12, Math.min(22, Math.min(cell.w, cell.h) * 0.32));
    const t = Date.now() / 1000;
    const speed = 0.4; // obrót w rad/s
    const baseAngle = (t * speed) % (Math.PI * 2);
    const step = (Math.PI * 2) / conditions.length;

    ctx.save();
    ctx.font = `${iconSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    conditions.forEach((c, i) => {
      const a = baseAngle + i * step - Math.PI / 2;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      // tło tarczki
      ctx.beginPath();
      ctx.arc(x, y, iconSize * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 12, 25, 0.85)';
      ctx.fill();
      ctx.strokeStyle = c.color || '#888';
      ctx.lineWidth = 2;
      ctx.stroke();
      // emoji
      ctx.fillStyle = '#fff';
      ctx.fillText(c.emoji, x, y + 1);
      // duration badge (mała liczba w prawym dolnym rogu)
      if (c.durationLeft != null && c.durationLeft >= 0) {
        const bx = x + iconSize * 0.55;
        const by = y + iconSize * 0.55;
        ctx.beginPath();
        ctx.arc(bx, by, iconSize * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#c0392b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(iconSize * 0.5)}px sans-serif`;
        ctx.fillText(String(c.durationLeft), bx, by + 1);
        ctx.font = `${iconSize}px sans-serif`;
      }
    });
    ctx.restore();
  },

  // ===== Mutacje (po stronie klienta) =====
  emitUpdate(tokenId, conditions) {
    if (!App.socket) return;
    App.socket.emit('map-token-conditions-update', { tokenId, conditions });
  },

  add(token, conditionId, durationRounds) {
    const cat = this.byId(conditionId);
    if (!cat) return;
    const list = this.parseConditions(token);
    // pojedyncza instancja per id (refresh czasu)
    const idx = list.findIndex((c) => c.id === conditionId);
    const dur = durationRounds == null ? null : Math.max(0, parseInt(durationRounds, 10) || 0);
    const entry = {
      id: cat.id,
      name: cat.name,
      emoji: cat.emoji,
      color: cat.color,
      durationLeft: dur,
      appliedAt: Date.now()
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    this.emitUpdate(token.id, list);
  },

  remove(token, conditionId) {
    const list = this.parseConditions(token).filter((c) => c.id !== conditionId);
    this.emitUpdate(token.id, list);
  },

  clear(token) {
    this.emitUpdate(token.id, []);
  },

  // ===== Modal UI =====
  openDialog(token) {
    if (!token) return;
    const overlay = document.createElement('div');
    overlay.id = 'map-cond-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal map-cond-modal">
        <div class="modal-header">
          <h3>⚠️ Stany na: ${escapeHtml(token.entity_name || 'Token')}</h3>
          <button type="button" class="modal-close" data-action="close">✕</button>
        </div>
        <div class="modal-body">
          <div class="map-cond-active" id="map-cond-active"></div>
          <h4 style="margin-top:14px;">Dodaj stan</h4>
          <p class="sheet-hint">Kliknij ikonę, podaj liczbę rund (puste = bezterminowo).</p>
          <div class="map-cond-grid" id="map-cond-grid"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" data-action="clear-all">🗑️ Usuń wszystkie</button>
          <button type="button" class="btn btn-primary" data-action="close">Zamknij</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-action="close"]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-action="clear-all"]').addEventListener('click', () => {
      if (confirm('Usunąć wszystkie stany z tego tokenu?')) {
        this.clear(token);
        close();
      }
    });

    const renderActive = () => {
      const fresh = (BattleMap.tokens || []).find((t) => t.id === token.id) || token;
      const list = this.parseConditions(fresh);
      const root = overlay.querySelector('#map-cond-active');
      if (!list.length) {
        root.innerHTML = '<p class="sheet-hint">Brak aktywnych stanów.</p>';
        return;
      }
      root.innerHTML = `<h4>Aktywne stany:</h4><div class="map-cond-active-list">${list.map((c) => `
        <div class="map-cond-active-row" data-cid="${escapeHtml(c.id)}">
          <span class="map-cond-emoji" style="background:${escapeHtml(c.color)}33;border-color:${escapeHtml(c.color)}">${escapeHtml(c.emoji)}</span>
          <span class="map-cond-name">${escapeHtml(c.name)}</span>
          <input type="number" min="0" max="999" class="map-cond-dur" value="${c.durationLeft == null ? '' : c.durationLeft}" placeholder="∞" title="Pozostałe rundy (puste = bezterminowo)">
          <button type="button" class="btn btn-xs btn-secondary" data-cond-update="${escapeHtml(c.id)}">Zapisz</button>
          <button type="button" class="btn btn-xs btn-danger" data-cond-remove="${escapeHtml(c.id)}">✕</button>
        </div>`).join('')}</div>`;
      root.querySelectorAll('[data-cond-remove]').forEach((b) => b.addEventListener('click', () => {
        this.remove(token, b.dataset.condRemove);
        setTimeout(renderActive, 200);
      }));
      root.querySelectorAll('[data-cond-update]').forEach((b) => b.addEventListener('click', () => {
        const row = b.closest('.map-cond-active-row');
        const inp = row.querySelector('.map-cond-dur');
        const id = b.dataset.condUpdate;
        const fresh2 = (BattleMap.tokens || []).find((t) => t.id === token.id) || token;
        const all = this.parseConditions(fresh2);
        const c = all.find((x) => x.id === id);
        if (!c) return;
        const v = inp.value.trim();
        c.durationLeft = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
        this.emitUpdate(token.id, all);
        setTimeout(renderActive, 200);
      }));
    };

    const grid = overlay.querySelector('#map-cond-grid');
    grid.innerHTML = this.CATALOG.map((c) => `
      <button type="button" class="map-cond-card" data-cond-add="${escapeHtml(c.id)}" style="border-color:${escapeHtml(c.color)}">
        <span class="map-cond-emoji" style="background:${escapeHtml(c.color)}55">${c.emoji}</span>
        <span class="map-cond-name">${escapeHtml(c.name)}</span>
        <small>${escapeHtml(c.desc)}</small>
      </button>`).join('');
    grid.querySelectorAll('[data-cond-add]').forEach((card) => card.addEventListener('click', () => {
      const id = card.dataset.condAdd;
      const cat = this.byId(id);
      if (!cat) return;
      const v = prompt(`Dodaj „${cat.name}". Ile rund? (puste = bezterminowo)`, '3');
      if (v === null) return;
      const rounds = v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);
      this.add(token, id, rounds);
      setTimeout(renderActive, 200);
    }));

    renderActive();
    // jeśli serwer pchnie aktualizację, odśwież panel
    this._activeRefresher = renderActive;
  },

  onTokensRefreshed() {
    if (typeof this._activeRefresher === 'function') this._activeRefresher();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapConditions;
}
