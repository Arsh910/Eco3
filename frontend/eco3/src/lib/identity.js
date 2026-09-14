const KEY = 'eco3-peer-id';

export function getPeerId() {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
