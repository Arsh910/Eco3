const SAMPLE_SIZE = 1024 * 1024;

export async function computeTransferId(file) {
  const head = file.slice(0, Math.min(SAMPLE_SIZE, file.size));
  const trailStart = Math.max(0, file.size - SAMPLE_SIZE);
  const tail = file.slice(trailStart, file.size);

  const headBuf = await head.arrayBuffer();
  const tailBuf = await tail.arrayBuffer();

  const sizeBuf = new ArrayBuffer(8);
  new DataView(sizeBuf).setBigUint64(0, BigInt(file.size))

  const combined = new Uint8Array(
    headBuf.byteLength + tailBuf.byteLength + 8
  )

  combined.set(new Uint8Array(headBuf), 0);
  combined.set(new Uint8Array(tailBuf), headBuf.byteLength);
  combined.set(new Uint8Array(sizeBuf), headBuf.byteLength + tailBuf.byteLength)

  const digest = await crypto.subtle.digest('SHA-256', combined);

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

}
