export function createBitmap(totalChunks) {
  return new Uint8Array(Math.ceil(totalChunks / 8));
}

export function setBit(bitmap, index) {
  bitmap[index >> 3] |= 1 << (index & 7);
}

export function hasBit(bitmap, index) {
  return (bitmap[index >> 3] & (1 << (index & 7))) !== 0;
}

export function countBits(bitmap) {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    let b = bitmap[i];
    while (b) { count += b & 1; b >>= 1; }
  }
  return count;
}

export function missingChunks(bitmap, totalChunks) {
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!hasBit(bitmap, i)) missing.push(i);
  }
  return missing;
}
