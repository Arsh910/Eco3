import { useRef, useState, useCallback } from 'react'
import { hasFSA } from '../lib/capabilities'
import { peerLabel } from '../lib/format'
import { getPeerId } from '../lib/identity'

const BASE_SOCKET_URL = `ws://localhost:8080/api/v1`
const BASE_API_URL = `http://localhost:8080/api/v1`
const CHUNK_SIZE = 64 * 1024;
const BUFFER_LOW_THRESHOLD = CHUNK_SIZE * 4;
const PREVIEWABLE = /^(image|video|audio|text)\/|^application\/pdf$/;

let messageId = 0;

const tkey = (peerId, fileId) => `${peerId}:${fileId}`;

export function useWebRTC() {
  const [peers, setPeers] = useState([]); // [{ id, state }]
  const [signaling, setSignaling] = useState('connecting');
  const [roomCode, setRoomCode] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [transfers, setTransfer] = useState({});

  const wsRef = useRef(null);
  const selfIdRef = useRef(null);

  const peersRef = useRef({});           // peerId -> { pc, control, fileChannel }
  const incommingRef = useRef({});       // peerId -> fileId -> state
  const lastUpdateRef = useRef({});      // "peerId:fileId" -> timestamp
  const pendingAcceptRef = useRef({});   // "peerId:fileId" -> resolve fn
  const sendingRef = useRef({});         // "peerId:fileId" -> { file, meta }

  const log = useCallback((msg) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const pushMessage = useCallback((from, text) => {
    messageId += 1;
    setMessages((prev) => [...prev, { id: messageId, from, text, at: Date.now() }]);
  }, []);

  const updateTransfer = useCallback((peerId, fileId, patch) => {
    const k = tkey(peerId, fileId);
    setTransfer((prev) => ({
      ...prev,
      [k]: { ...prev[k], peerId, fileId, ...patch },
    }));
  }, []);

  const tryFinalize = useCallback(async (peerId, fileId) => {
    const state = incommingRef.current[peerId]?.[fileId];
    if (!state) return;
    if (!state.writable) return;
    if (!state.completeSignal) return;
    if (state.receivedSet.size < state.meta.totalChunks) return;

    // lands second, so guard against closing the stream twice.
    if (state.finalizing) return;
    state.finalizing = true;

    await state.writable.close();

    peersRef.current[peerId]?.control?.send(JSON.stringify({ type: 'file-verified', fileId }));

    // costs nothing and opening it never re-downloads the file.
    const file = await state.handle.getFile();
    const openUrl = PREVIEWABLE.test(file.type) ? URL.createObjectURL(file) : null;

    updateTransfer(peerId, fileId, { done: true, received: state.receivedSet.size, openUrl });
    log(`file completed from ${peerLabel(peerId)}: ${state.meta.name}`);

    delete incommingRef.current[peerId][fileId];
    delete lastUpdateRef.current[tkey(peerId, fileId)];

  }, [log, updateTransfer]);

  const getMissingChunks = (state) => {
    const missing = [];
    for (let i = 0; i < state.meta.totalChunks; i++) {
      if (!state.receivedSet.has(i)) missing.push(i);
    }
    return missing;
  };

  const shouldOffer = (myId, theirId) => myId > theirId;

  const resendChunks = useCallback(async (peerId, fileId, file, indices, chunkSize) => {
    const entry = peersRef.current[peerId];
    const fileChannel = entry?.fileChannel;
    if (!fileChannel || fileChannel.readyState !== 'open') return;

    const k = tkey(peerId, fileId);
    fileChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    const waitForBuffer = () => new Promise((resolve) => {
      if (fileChannel.readyState !== 'open') return reject(new Error('channel closed'));
      if (fileChannel.bufferedAmount <= BUFFER_LOW_THRESHOLD) return resolve();

      const onLow = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); reject(new Error('channel closed')); };
      const cleanup = () => {
        fileChannel.removeEventListener('bufferedamountlow', onLow);
        fileChannel.removeEventListener('close', onClose);
      };

      fileChannel.addEventListener('bufferedamountlow', onLow, { once: true });
      fileChannel.addEventListener('close', onClose, { once: true });
    });

    log(`resending ${indices.length} chunks to ${peerId.slice(0, 8)}`);

    let done = 0;
    try {
      for (const index of indices) {
        await waitForBuffer();
        const start = index * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());

        const header = new ArrayBuffer(4);
        new DataView(header).setUint32(0, index);
        const payload = new Uint8Array(4 + bytes.length);
        payload.set(new Uint8Array(header), 0);
        payload.set(bytes, 4);
        fileChannel.send(payload.buffer);

        done += 1;
        const now = performance.now();
        const last = lastUpdateRef.current[k] || 0;
        if (now - last > 100 || done === indices.length) {
          lastUpdateRef.current[k] = now;
          updateTransfer(peerId, fileId, { resending: true, resent: done, resendTotal: indices.length });
        }
      }

      updateTransfer(peerId, fileId, { resending: false });

      entry.control?.send(JSON.stringify({ type: 'file-complete', fileId }));
      log(`resend complete to ${peerId.slice(0, 8)}`);
    }
    catch (e) {
      log(`resend interrupted to ${peerLabel(peerId)}: ${e.message}`);
      updateTransfer(peerId, fileId, { resending: false, interrupted: true });
    }

  }, [log, updateTransfer]);

  const handleControlMessage = useCallback((peerId, rawMsg) => {
    const msg = JSON.parse(rawMsg);

    if (msg.type === 'chat') {
      pushMessage(peerId, msg.text);
      return;
    }

    if (msg.type === 'file-meta') {
      if (!incommingRef.current[peerId]) incommingRef.current[peerId] = {};
      incommingRef.current[peerId][msg.fileId] = {
        writable: null,
        handle: null,
        accepted: false,
        completeSignal: false,
        finalizing: false,
        receivedSet: new Set(),
        meta: msg,
      }
      updateTransfer(peerId, msg.fileId, {
        name: msg.name,
        size: msg.size,
        received: 0,
        total: msg.totalChunks,
        done: false,
        accepted: false,
        direction: 'receiving',
      });
      log(`incomming file : ${msg.name} (${msg.totalChunks} chunks)`)
      return;
    }

    if (msg.type === 'file-accept') {
      const k = tkey(peerId, msg.fileId);
      const resolver = pendingAcceptRef.current[k];
      if (resolver) {
        resolver();
        delete pendingAcceptRef.current[k];
      }
      return;
    }

    if (msg.type === 'resume-request') {
      const pending = sendingRef.current[tkey(peerId, msg.fileId)];
      if (!pending) {
        log(`resume requested but file no longer held: ${msg.fileId}`);
        return;
      }
      resendChunks(peerId, msg.fileId, pending.file, msg.missing, pending.meta.chunkSize);
      return;
    }

    if (msg.type === 'file-verified') {
      delete sendingRef.current[tkey(peerId, msg.fileId)];
      log(`peer confirmed: ${msg.fileId}`);
      return;
    }

    if (msg.type === 'file-complete') {
      const state = incommingRef.current[peerId]?.[msg.fileId];
      if (!state) return;
      state.completeSignal = true;

      const missing = getMissingChunks(state);
      if (missing.length > 0 && state.accepted) {
        log(`still missing ${missing.length} chunks, re-requesting`);
        peersRef.current[peerId]?.control?.send(JSON.stringify({
          type: 'resume-request', fileId: msg.fileId, missing,
        }));
        return;
      }

      tryFinalize(peerId, msg.fileId);
      return;
    }

  }, [log, pushMessage, updateTransfer, tryFinalize, resendChunks]);

  const handleFileChunck = useCallback(async (peerId, buffer) => {
    const view = new DataView(buffer);
    const index = view.getUint32(0);
    const chunckData = buffer.slice(4);


    const peerFiles = incommingRef.current[peerId];
    if (!peerFiles) return;

    const fileId = Object.keys(peerFiles)[0];
    if (!fileId) return;

    const state = peerFiles[fileId];
    if (!state?.writable) return;

    // The file channel is unordered, so every chunk must name its own offset.
    await state.writable.write({
      type: 'write',
      position: index * state.meta.chunkSize,
      data: chunckData,
    })

    state.receivedSet.add(index);

    //performance improvement
    const k = tkey(peerId, fileId);
    const now = performance.now()
    const last = lastUpdateRef.current[k] || 0;
    if (now - last > 100 || state.receivedSet.size === state.meta.totalChunks) {
      lastUpdateRef.current[k] = now;
      updateTransfer(peerId, fileId, { received: state.receivedSet.size });
    }
    tryFinalize(peerId, fileId);

  }, [updateTransfer, tryFinalize]);

  const requestResume = useCallback((peerId) => {
    const peerFiles = incommingRef.current[peerId];
    if (!peerFiles) return;

    Object.entries(peerFiles).forEach(([fileId, state]) => {
      if (!state.accepted || state.finalizing) return;

      const missing = getMissingChunks(state);
      if (missing.length === 0) return;

      updateTransfer(peerId, fileId, { interrupted: false })

      peersRef.current[peerId]?.control?.send(JSON.stringify({
        type: 'resume-request', fileId, missing,
      }));
      log(`resume: asking ${peerId.slice(0, 8)} for ${missing.length} chunks`);
    });

  }, [log, updateTransfer]);

  const createPeerConnection = useCallback((peerId, isOfferer) => {
    const existing = peersRef.current[peerId];
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    const entry = { pc, control: null, fileChannel: null };
    peersRef.current[peerId] = entry;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current.send(JSON.stringify({ type: 'candidate', to: peerId, candidate: event.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      setPeers((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, state: pc.connectionState } : p))
      );
    }

    const wireControl = (ch) => {
      entry.control = ch;
      ch.onopen = () => { log(`control channel open: ${peerLabel(peerId)}`); requestResume(peerId); };
      ch.onclose = () => log(`control channel closed: ${peerLabel(peerId)}`);
      ch.onmessage = (e) => handleControlMessage(peerId, e.data);
    }

    const wireFile = (ch) => {
      entry.fileChannel = ch;
      ch.binaryType = 'arraybuffer';
      ch.onopen = () => log(`file channel open: ${peerLabel(peerId)}`);
      ch.onclose = () => log(`file chanel closed: ${peerLabel(peerId)}`);
      ch.onmessage = (e) => handleFileChunck(peerId, e.data);
    }

    if (isOfferer) {
      wireControl(pc.createDataChannel('control'));
      wireFile(pc.createDataChannel('file', { ordered: false }));

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => wsRef.current.send(JSON.stringify({
          type: 'offer', to: peerId, sdp: offer,
        })));

    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === 'control') wireControl(event.channel);
        else if (event.channel.label === 'file') wireFile((event.channel));
      }
    }

    return entry;

  }, [log, handleControlMessage, handleFileChunck]);

  const connectToRoom = useCallback((code, alias) => {
    setRoomCode(code);

    const myId = getPeerId();
    selfIdRef.current = myId;
    setSelfId(myId);

    const params = new URLSearchParams({ peerId: myId });
    if (alias) params.set('alias', alias);

    const ws = new WebSocket(`${BASE_SOCKET_URL}/ws/${code}?${params}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setSignaling('open');
      log('signaling connected');
    };

    ws.onclose = () => {
      setSignaling('closed');
      log('signaling closed');
    };

    ws.onerror = () => {
      setSignaling('error');
      log('signaling error');
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'error') {
        log('signaling: ' + msg.message);
        return;
      }

      if (msg.type === 'peers') {
        if (msg.self !== selfIdRef.current) {
          log(`warning server if mismatch ${msg.self}`)
          selfIdRef.current = msg.self;
          setSelfId(msg.self);
        }
        setPeers(msg.peers.map((p) => ({ id: p.id, alias: p.alias, state: 'new' })));

        msg.peers.forEach((p) => {
          peersRef.current[p.id]?.pc.close();
          delete peersRef.current[p.id];
          createPeerConnection(p.id, shouldOffer(selfIdRef.current, p.id));
        });
        return;
      }

      // Only now is there someone in the room to receive the offer.
      if (msg.type === 'peer-joined') {

        if (msg.peerId === selfIdRef.current) return;

        const stale = peersRef.current[msg.peerId];
        if (stale) {
          stale.pc.close();
          delete peersRef.current[msg.peerId];
          log(`peer reconnected : ${peerLabel(msg.peerId)}`);
        } else {
          log(`peer joined: ${peerLabel(msg.peerId)}`);
        }

        setPeers((prev) => [
          ...prev.filter((p) => p.id !== msg.peerId),
          { id: msg.peerId, alias: msg.alias, state: 'new' },
        ]);

        createPeerConnection(msg.peerId, shouldOffer(selfIdRef.current, msg.peerId));
        return;
      }

      if (msg.type === 'peer-left') {
        peersRef.current[msg.peerId]?.pc.close();

        Object.keys(incommingRef.current[msg.peerId] || {}).forEach((fileId) => {
          updateTransfer(msg.peerId, fileId, { interrupted: true });
        });

        delete peersRef.current[msg.peerId];
        // delete incommingRef.current[msg.peerId]; to resume state

        setPeers((prev) => prev.filter((p) => p.id !== msg.peerId));

        log(`peer left : ${peerLabel(msg.peerId)}`);
        return;
      }

      const entry = peersRef.current[msg.from] || createPeerConnection(msg.from, false);
      const pc = entry.pc;

      if (msg.type === 'offer') {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", to: msg.from, sdp: answer }))
      }

      else if (msg.type === 'answer') {
        await pc.setRemoteDescription(msg.sdp);
      }

      else if (msg.type === 'candidate') {
        try {
          await pc.addIceCandidate(msg.candidate);
        }
        catch (e) {
          log("ice candidate error: " + e.message);
        }
      }
    }

  }, [log, createPeerConnection, updateTransfer]);

  const createRoom = useCallback(async (alias) => {
    const res = await fetch(`${BASE_API_URL}/room/create`, { method: 'POST' });
    if (!res.ok) throw new Error(`room create failed: ${res.status}`);

    const data = await res.json();
    connectToRoom(data.code, alias);
    return data.code;

  }, [connectToRoom]);

  const joinRoom = useCallback((code, alias) => {
    connectToRoom(code, alias);
  }, [connectToRoom]);

  // Called straight from a button click.
  const acceptFile = useCallback(async (peerId, fileId) => {
    const state = incommingRef.current[peerId]?.[fileId];
    if (!state || state.accepted) return;

    if (!hasFSA) {
      log('this browser cannot stream files to disk (needs the File System Access API)');
      return;
    }

    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: state.meta.name });
    } catch {
      log(`save cancelled: ${state.meta.name}`);
      return;
    }

    state.handle = handle;
    state.writable = await handle.createWritable({ keepExistingData: true });
    state.accepted = true;

    updateTransfer(peerId, fileId, { accepted: true, savedName: handle.name });
    peersRef.current[peerId]?.control?.send(JSON.stringify({ type: 'file-accept', fileId }));
    log(`accepted from ${peerLabel(peerId)}: ${state.meta.name}`);
  }, [log, updateTransfer]);

  const sendMessage = useCallback((text, targetIds) => {
    const targets = targetIds?.length ? targetIds : Object.keys(peersRef.current);
    let sent = 0;

    targets.forEach((peerId) => {
      const ch = peersRef.current[peerId]?.control;
      if (ch?.readyState === 'open') {
        ch.send(JSON.stringify({ type: 'chat', text }));
        sent += 1;
      }
    })

    if (sent === 0) {
      log('error: no open control channels');
      return
    }

    pushMessage('me', text);

  }, [log, pushMessage]);

  const sendFiletoPeer = useCallback(async (file, peerId) => {
    const entry = peersRef.current[peerId];
    const control = entry?.control;
    const fileChannel = entry?.fileChannel;

    if (!control || !fileChannel || fileChannel.readyState != 'open') {
      log('channels are not ready');
      return;
    }
    const fileId = `${file.name} - ${file.size} - ${Date.now()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const k = tkey(peerId, fileId);

    sendingRef.current[k] = {
      file,
      meta: { fileId, name: file.name, size: file.size, totalChunks, chunkSize: CHUNK_SIZE },
    };

    control.send(JSON.stringify({
      type: 'file-meta',
      fileId,
      name: file.name,
      size: file.size,
      totalChunks,
      chunkSize: CHUNK_SIZE,
    }))

    // Shown before the wait so the sender can see the file is pending approval.
    updateTransfer(peerId, fileId, {
      name: file.name,
      size: file.size,
      sent: 0,
      total: totalChunks,
      done: false,
      accepted: false,
      direction: 'sending',
    })

    await new Promise((resolve) => {
      pendingAcceptRef.current[k] = resolve;
      setTimeout(() => {
        if (pendingAcceptRef.current[k]) {
          delete pendingAcceptRef.current[k];
          delete sendingRef.current[k];
          updateTransfer(peerId, fileId, { failed: true, reason: 'not accepted' });
          reject(new Error('accept timeout'));
        }
      }, 120000);
    });

    log(`peer accepted, sending chunks: ${peerLabel(peerId)}`);
    updateTransfer(peerId, fileId, { accepted: true });

    fileChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    let index = 0;
    const reader = file.stream().getReader();
    let leftover = new Uint8Array(0);

    const sendChunk = (bytes, idx) => {
      const header = new ArrayBuffer(4);
      new DataView(header).setUint32(0, idx);
      const payload = new Uint8Array(4 + bytes.length);
      payload.set(new Uint8Array(header), 0);
      payload.set(bytes, 4);
      fileChannel.send(payload.buffer);
    }

    const waitForBuffer = () => {
      return new Promise((resolve) => {
        if (fileChannel.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
          resolve();
        } else {
          fileChannel.addEventListener('bufferedamountlow', () => resolve(), { once: true });
        }
      })
    }

    // performance improvement
    function concatBuffers(a, b) {
      const out = new Uint8Array(a.length + b.length);
      out.set(a, 0);
      out.set(b, a.length);
      return out;
    }
    try {
      while (1) {
        const { done, value } = await reader.read();
        // let data = value ? new Uint8Array([...leftover, ...value]) : leftover;

        // performance imporvement
        let data = value ? concatBuffers(leftover, value) : leftover;

        let offset = 0;
        while (data.length - offset >= CHUNK_SIZE) {
          await waitForBuffer();
          sendChunk(data.slice(offset, offset + CHUNK_SIZE), index);
          index += 1;

          //performance improvement
          const now = performance.now()
          const last = lastUpdateRef.current[k] || 0;
          if (now - last > 100 || index === totalChunks) {
            lastUpdateRef.current[k] = now;
            updateTransfer(peerId, fileId, { sent: index });
          }

          offset += CHUNK_SIZE;
        }
        leftover = data.subarray(offset);

        if (done) {
          if (leftover.length > 0) {
            await waitForBuffer();
            sendChunk(leftover, index);
            index += 1;

            //performance improvement
            const now = performance.now()
            const last = lastUpdateRef.current[k] || 0;
            if (now - last > 100 || index === totalChunks) {
              lastUpdateRef.current[k] = now;
              updateTransfer(peerId, fileId, { sent: index });
            }

          }
          break;
        }
      }

      control.send(JSON.stringify({ type: 'file-complete', fileId }));
      updateTransfer(peerId, fileId, { done: true });
      delete lastUpdateRef.current[k];
      log(`sent file to ${peerLabel(peerId)}: ${file.name}`);
    }
    catch {
      log(`transfer interrupted to ${peerLabel(peerId)}: ${e.message}`);
      updateTransfer(peerId, fileId, { interrupted: true });
      reader.cancel().catch(() => { });
    }

  }, [log, updateTransfer]);

  const sendFile = useCallback(async (file, targetIds) => {
    const targets = targetIds?.length ? targetIds : Object.keys(peersRef.current);
    await Promise.all(targets.map((peerId) => sendFiletoPeer(file, peerId)))
  }, [sendFiletoPeer])

  return { peers, signaling, roomCode, selfId, messages, logs, transfers, createRoom, joinRoom, sendMessage, sendFile, acceptFile };
}
