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

function showGenericModal(title, bodyHtml, sizeClass) {
  document.getElementById('generic-modal-title').textContent = title;
  document.getElementById('generic-modal-body').innerHTML = bodyHtml;
  const content = document.querySelector('#generic-modal .modal-content');
  if (content) {
    content.classList.remove('modal-xl', 'modal-lg', 'map-creator-modal');
    if (sizeClass) {
      sizeClass.split(/\s+/).filter(Boolean).forEach((cls) => content.classList.add(cls));
    }
  }
  openModal('generic-modal');
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
