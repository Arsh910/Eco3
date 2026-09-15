const STUN_SERVERS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

function gatherSrflx(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_SERVERS }] });
    const found = [];
    let timer;

    const done = () => {
      clearTimeout(timer);
      pc.close();
      resolve(found);
    };

    timer = setTimeout(done, timeoutMs);

    pc.onicecandidate = (event) => {
      if (!event.candidate) return done();          // gathering finished
      const c = event.candidate;
      if (c.type === 'srflx') found.push({ address: c.address, port: c.port });
    };

    pc.createDataChannel('probe');                   // needed to trigger gathering
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(done);
  });
}

export async function detectNatType() {
  try {
    const srflx = await gatherSrflx();
    if (srflx.length === 0) return 'blocked';

    const portsByAddress = new Map();
    srflx.forEach(({ address, port }) => {
      if (!portsByAddress.has(address)) portsByAddress.set(address, new Set());
      portsByAddress.get(address).add(port);
    });

    const symmetric = [...portsByAddress.values()].some((ports) => ports.size > 1);
    return symmetric ? 'symmetric' : 'open';
  } catch {
    return 'unknown';
  }
}
