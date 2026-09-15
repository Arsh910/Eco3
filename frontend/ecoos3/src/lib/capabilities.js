// Receiving streams chunks straight to disk with the File System Access API, which is Chromium-only. Sending and chat work in every browser.

export const hasFSA = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export const hasOpenPicker = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export const canPersistTransfers = hasFSA && hasOpenPicker;
