import { useRef, useState, useCallback } from 'react'
import { hasFSA } from '../lib/capabilities'
import { peerLabel } from '../lib/format'

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
    if (state.received < state.meta.totalChunks) return;

    // lands second, so guard against closing the stream twice.
    if (state.finalizing) return;
    state.finalizing = true;

    await state.writable.close();

    // costs nothing and opening it never re-downloads the file.
    const file = await state.handle.getFile();
    const openUrl = PREVIEWABLE.test(file.type) ? URL.createObjectURL(file) : null;

    updateTransfer(peerId, fileId, { done: true, received: state.received, openUrl });
    log(`file completed from ${peerLabel(peerId)}: ${state.meta.name}`);

    delete incommingRef.current[peerId][fileId];
    delete lastUpdateRef.current[tkey(peerId, fileId)];

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
        received: 0,
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

    if (msg.type === 'file-complete') {
      const state = incommingRef.current[peerId]?.[msg.fileId];
      if (!state) return;
      state.completeSignal = true;
      tryFinalize(peerId, msg.fileId);
    }

  }, [log, pushMessage, updateTransfer, tryFinalize]);

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

    state.received += 1;

    //performance improvement
    const k = tkey(peerId, fileId);
    const now = performance.now()
    const last = lastUpdateRef.current[k] || 0;
    if (now - last > 100 || state.received === state.meta.totalChunks) {
      lastUpdateRef.current[k] = now;
      updateTransfer(peerId, fileId, { received: state.received });
    }
    tryFinalize(peerId, fileId);

  }, [updateTransfer, tryFinalize]);

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
      ch.onopen = () => log(`control channel open: ${peerLabel(peerId)}`);
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


  const shouldOffer = (myId, theirId) => myId > theirId;

  const connectToRoom = useCallback((code, alias) => {
    setRoomCode(code);

    const query = alias ? `?alias=${encodeURIComponent(alias)}` : '';
    const ws = new WebSocket(`${BASE_SOCKET_URL}/ws/${code}${query}`);
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
        selfIdRef.current = msg.self;
        setSelfId(msg.self);
        setPeers(msg.peers.map((id) => ({ id, state: 'new' })));
        msg.peers.forEach((peerId) => {
          createPeerConnection(peerId, shouldOffer(msg.self, peerId));
        });
        return;
      }

      // Only now is there someone in the room to receive the offer.
      if (msg.type === 'peer-joined') {
        setPeers((prev) => [...prev, { id: msg.peerId, state: 'new' }]);
        createPeerConnection(msg.peerId, shouldOffer(selfIdRef.current, msg.peerId));
        log(`peer joined: ${peerLabel(msg.peerId)}`);
        return;
      }

      if (msg.type === 'peer-left') {
        peersRef.current[msg.peerId]?.pc.close();

        delete peersRef.current[msg.peerId];
        delete incommingRef.current[msg.peerId];

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

  }, [log, createPeerConnection]);

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

  }, [log, updateTransfer]);

  const sendFile = useCallback(async (file, targetIds) => {
    const targets = targetIds?.length ? targetIds : Object.keys(peersRef.current);
    await Promise.all(targets.map((peerId) => sendFiletoPeer(file, peerId)))
  }, [sendFiletoPeer])

  return { peers, signaling, roomCode, selfId, messages, logs, transfers, createRoom, joinRoom, sendMessage, sendFile, acceptFile };
}
