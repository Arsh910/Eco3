import { listPending } from './transferStore'

async function permissionState(handle, mode) {
  if (!handle) return 'missing';
  try {
    return await handle.queryPermission({ mode });
  } catch {
    return 'missing';
  }
}

export async function loadResumable() {
  const records = await listPending();

  return Promise.all(
    records.map(async (r) => {

      // No handle to check: the user re-selects the file when resuming.
      if (r.needsReselect) return { ...r, needsPermission: false, unavailable: false };

      const mode = r.role === 'receiver' ? 'readwrite' : 'read';
      const perm = await permissionState(r.handle, mode);
      return {
        ...r,
        needsPermission: perm === 'prompt',
        unavailable: perm === 'missing' || perm === 'denied',
      }
    })
  )
}

export async function grantPermission(record) {
  const mode = record.role === 'receiver' ? 'readwrite' : 'read';
  if (!record.handle) return false;
  if ((await record.handle.queryPermission({ mode })) == 'granted') return true;
  return (await record.handle.requestPermission({ mode }) == 'granted');
}
