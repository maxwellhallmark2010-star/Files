// Save slots and settings in localStorage.
const KEY = 'backrooms.save.';
const SETTINGS = 'backrooms.settings';
export const SLOTS = 3;

export const DEFAULT_SETTINGS = {
  sensitivity: 1, invertY: false, fov: 75, volume: 0.8, quality: 'high', grain: true, voice: true, peerHost: '', resScale: 0, showFps: false, touch: 'auto', minimap: true,
};

function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(get(SETTINGS) || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { set(SETTINGS, JSON.stringify(s)); }

export function listSaves() {
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    try {
      const raw = get(KEY + i);
      out.push(raw ? JSON.parse(raw) : null);
    } catch (e) { out.push(null); }
  }
  return out;
}
export function writeSave(slot, data) { return set(KEY + slot, JSON.stringify({ ...data, slot, savedAt: Date.now() })); }
export function readSave(slot) { try { return JSON.parse(get(KEY + slot)); } catch (e) { return null; } }
export function deleteSave(slot) { try { localStorage.removeItem(KEY + slot); } catch (e) { /* ignore */ } }
export function latestSave() {
  return listSaves().filter(Boolean).sort((a, b) => b.savedAt - a.savedAt)[0] || null;
}
