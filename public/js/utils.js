// ===== Utility Functions =====
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('dedeki_token');
}

function setToken(token) {
  localStorage.setItem('dedeki_token', token);
}

function removeToken() {
  localStorage.removeItem('dedeki_token');
}

function getUser() {
  const data = localStorage.getItem('dedeki_user');
  return data ? JSON.parse(data) : null;
}

function setUser(user) {
  localStorage.setItem('dedeki_user', JSON.stringify(user));
}

function removeUser() {
  localStorage.removeItem('dedeki_user');
}

async function apiFetch(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const config = { ...options, headers };
  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Błąd serwera');
  }
  return data;
}

async function uploadCharacterImage(charId, type, file) {
  const formData = new FormData();
  formData.append('image', file);
  const endpoint = type === 'portrait' ? `/characters/${charId}/portrait` : `/characters/${charId}/avatar`;
  return apiFetch(endpoint, { method: 'POST', body: formData });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function stripLeadingEmoji(str) {
  if (!str) return '';
  const trimmed = String(str).replace(/^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}]+/u, '').trim();
  return trimmed || String(str);
}

function showGenericModal(title, bodyHtml, sizeClass, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const modal = document.getElementById('generic-modal');
  const headerEl = modal?.querySelector('.modal-header');
  const icon = options.icon || '📋';
  const displayTitle = options.title != null ? options.title : stripLeadingEmoji(title);
  const meta = options.meta;
  if (headerEl) {
    headerEl.outerHTML = featureModalHeader(icon, displayTitle, meta);
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.onclick = () => closeModal('generic-modal');
  } else {
    const titleEl = document.getElementById('generic-modal-title');
    if (titleEl) titleEl.textContent = title;
  }
  document.getElementById('generic-modal-body').innerHTML = bodyHtml;
  const content = document.querySelector('#generic-modal .modal-content');
  if (content) {
    content.classList.remove('modal-xl', 'modal-lg', 'map-creator-modal', 'dm-feature-editor-shell');
    content.classList.add('dm-feature-editor-shell');
    if (sizeClass) {
      sizeClass.split(/\s+/).filter(Boolean).forEach((cls) => content.classList.add(cls));
    }
  }
  openModal('generic-modal');
}

/** Shell modala narzędzia MG (overlay). footerHtml: string lub null = brak stopki. */
function buildFeatureModalHtml({ icon, title, meta, modalClass = '', toolbarHtml = '', bodyHtml = '', footerHtml = null }) {
  const toolbar = toolbarHtml
    ? (toolbarHtml.includes('dm-feature-toolbar') ? toolbarHtml : `<div class="dm-feature-toolbar">${toolbarHtml}</div>`)
    : '';
  let footer = '';
  if (footerHtml !== null && footerHtml !== undefined) {
    footer = footerHtml.includes('modal-footer')
      ? footerHtml
      : `<div class="modal-footer dm-feature-footer">${footerHtml}</div>`;
  }
  const classes = ['modal', 'dm-feature-modal', modalClass].filter(Boolean).join(' ');
  return `
    <div class="${classes}">
      ${featureModalHeader(icon, title, meta)}
      ${toolbar}
      <div class="modal-body dm-feature-body">${bodyHtml}</div>
      ${footer}
    </div>`;
}

function createStackedFeatureOverlay(overlayId, modalHtml) {
  const overlay = createFeatureOverlay(overlayId, modalHtml);
  overlay.classList.add('modal-overlay--stacked');
  return overlay;
}

/** Nagłówek okna narzędzia MG (overlay). meta: liczba (badge) lub string (podtytuł). */
function featureModalHeader(icon, title, meta) {
  const countBadge = typeof meta === 'number' ? `<span class="dm-feature-count">${meta}</span>` : '';
  const subLine = typeof meta === 'string' && meta
    ? `<p class="dm-feature-header__sub">${escapeHtml(meta)}</p>` : '';
  return `
    <div class="modal-header dm-feature-header">
      <div class="dm-feature-header__brand">
        <span class="dm-feature-header__icon" aria-hidden="true">${icon}</span>
        <div class="dm-feature-header__titles">
          <h3>${escapeHtml(title)}${countBadge}</h3>
          ${subLine}
        </div>
      </div>
      <button type="button" class="modal-close" data-action="close" aria-label="Zamknij">✕</button>
    </div>`;
}

function featureModalFooter(extraHtml) {
  const extra = extraHtml ? `${extraHtml}` : '';
  return `<div class="modal-footer dm-feature-footer">${extra}<button type="button" class="btn btn-secondary" data-action="close">Zamknij</button></div>`;
}

function bindFeatureOverlay(overlay) {
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-action="close"]').forEach((b) => b.addEventListener('click', close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { overlay, close };
}

function createFeatureOverlay(overlayId, modalHtml) {
  document.getElementById(overlayId)?.remove();
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'modal-overlay';
  overlay.innerHTML = modalHtml;
  document.body.appendChild(overlay);
  bindFeatureOverlay(overlay);
  return overlay;
}

function calcModifier(score) {
  return Math.floor((score - 10) / 2);
}

function modString(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pl-PL');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// D&D 5e Data
const DND_RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling', 'Dragonborn', 'Aasimar', 'Goliath', 'Tabaxi', 'Kenku', 'Firbolg', 'Lizardfolk', 'Changeling', 'Warforged'];
const DND_CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard', 'Artificer', 'Blood Hunter'];
const DND_ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];
const DND_BACKGROUNDS = ['Acolyte', 'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero', 'Guild Artisan', 'Hermit', 'Noble', 'Outlander', 'Sage', 'Sailor', 'Soldier', 'Urchin'];

const DND_SKILLS = {
  'Acrobatics': 'dexterity',
  'Animal Handling': 'wisdom',
  'Arcana': 'intelligence',
  'Athletics': 'strength',
  'Deception': 'charisma',
  'History': 'intelligence',
  'Insight': 'wisdom',
  'Intimidation': 'charisma',
  'Investigation': 'intelligence',
  'Medicine': 'wisdom',
  'Nature': 'intelligence',
  'Perception': 'wisdom',
  'Performance': 'charisma',
  'Persuasion': 'charisma',
  'Religion': 'intelligence',
  'Sleight of Hand': 'dexterity',
  'Stealth': 'dexterity',
  'Survival': 'wisdom'
};

const DND_SKILL_NAMES_PL = {
  'Acrobatics': 'Akrobatyka',
  'Animal Handling': 'Opieka nad zwierzętami',
  'Arcana': 'Arkana',
  'Athletics': 'Atletyka',
  'Deception': 'Oszustwo',
  'History': 'Historia',
  'Insight': 'Wnikliwość',
  'Intimidation': 'Zastraszanie',
  'Investigation': 'Śledztwo',
  'Medicine': 'Medycyna',
  'Nature': 'Przyroda',
  'Perception': 'Percepcja',
  'Performance': 'Występy',
  'Persuasion': 'Perswazja',
  'Religion': 'Religia',
  'Sleight of Hand': 'Zwinne dłonie',
  'Stealth': 'Skradanie',
  'Survival': 'Przetrwanie'
};

const ABILITY_NAMES_PL = {
  'strength': 'Siła',
  'dexterity': 'Zręczność',
  'constitution': 'Kondycja',
  'intelligence': 'Inteligencja',
  'wisdom': 'Mądrość',
  'charisma': 'Charyzma'
};

const ABILITY_SHORT = {
  'strength': 'STR',
  'dexterity': 'DEX',
  'constitution': 'CON',
  'intelligence': 'INT',
  'wisdom': 'WIS',
  'charisma': 'CHA'
};
