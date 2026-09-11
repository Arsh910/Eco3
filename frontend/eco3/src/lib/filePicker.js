import { hasOpenPicker } from './capabilities';

export async function pickFiles({ multiple = false } = {}) {
  if (!hasOpenPicker) return [];
  try {
    return await window.showOpenFilePicker({ multiple });
  } catch (err) {
    if (err.name === 'AbortError') return [];
    throw err;
  }
}

export async function ensureReadPermission(handle) {
  const opts = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

export const isHandle = (source) => source != null && typeof source.getFile === 'function';
