import { useRef, useState, useCallback, useEffect } from 'react'
import { hasFSA } from '../lib/capabilities'
import { peerLabel } from '../lib/format'
import { getPeerId } from '../lib/identity'
import { computeTransferId } from '../lib/fileIdentity'
import { ensureReadPermission, isHandle } from '../lib/filePicker'
import { createBitmap, hasBit, setBit, countBits, missingChunks } from '../lib/bitmap'
import { saveTransfer, patchTransfer, deleteTransfer, listTransfers, pruneOld } from '../lib/transferStore'
import { loadResumable, grantPermission } from '../lib/resume';

const BASE_SOCKET_URL = `ws://localhost:8080/api/v1`
const BASE_API_URL = `http://localhost:8080/api/v1`
const CHUNK_SIZE = 64 * 1024;
const BUFFER_LOW_THRESHOLD = CHUNK_SIZE * 4;
const PREVIEWABLE = /^(image|video|audio|text)\/|^application\/pdf$/;
const tkey = (peerId, fileId) => `${peerId}:${fileId}`;
const nameOf = (metaRef, peerId) => peerLabel(peerId, metaRef.current[peerId]?.alias);

let messageId = 0;

const loadPersist = () => localStorage.getItem('eco3-persist') !== 'off';

export function useWebRTC() {
  const [peers, setPeers] = useState([]); // [{ id, state }]
  const [signaling, setSignaling] = useState('connecting');
  const [roomCode, setRoomCode] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [transfers, setTransfer] = useState({});
  const [persist, setPersistState] = useState(loadPersist);
  const [resumable, setResumable] = useState([]);
  const [resumeBusy, setResumeBusy] = useState(null);
  const [availableMatches, setAvailableMatches] = useState({});

  const wsRef = useRef(null);
  const selfIdRef = useRef(null);
  const lastFlushRef = useRef({});

  const peersRef = useRef({});           // peerId -> { pc, control, fileChannel }
  const incommingRef = useRef({});       // peerId -> fileId -> state
  const lastUpdateRef = useRef({});      // "peerId:fileId" -> timestamp
  const pendingAcceptRef = useRef({});   // "peerId:fileId" -> resolve fn
  const sendingRef = useRef({});         // "peerId:fileId" -> { file, meta }
  const peerMetaRef = useRef({});        // peerId -> { alias }


  const log = useCallback((msg) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const setPersist = useCallback((on) => {
    localStorage.setItem('eco3-persist', on ? 'on' : 'off');
    setPersistState(on);
  }, []);

  const refreshResumable = useCallback(async () => {
    const records = await loadResumable();

    // Transfers already held in memory are live, not "unfinished from before".
    setResumable(records.filter((r) =>
      !incommingRef.current[r.peerId]?.[r.transferId] &&
      !sendingRef.current[tkey(r.peerId, r.transferId)]
    ));
  }, [])

  const markMatches = useCallback(async (peerId, remoteTransfers) => {
    const offered = new Map(remoteTransfers.map((t) => [t.transferId, t]));
    const records = await listTransfers(peerId);

    const alias = peerMetaRef.current[peerId]?.alias || null;
    const matches = {};
    const saves = [];
    records.filter((r) => r.status !== 'complete').forEach((r) => {
      const remote = offered.get(r.transferId);
      const partner = r.role === 'receiver' ? 'sender' : 'receiver';
      matches[`${r.transferId}:${peerId}`] = remote?.role === partner;

      const update = {};

      // The id is what matched; the name may have changed since, so refresh it.
      if ((r.peerAlias || null) !== alias) update.peerAlias = alias;

      // Only the receiver knows what arrived: keep its count so the sender can show progress.
      if (r.role === 'sender' && remote?.role === 'receiver' && remote.have !== undefined) {
        update.peerHave = remote.have;
      }
      if (Object.keys(update).length > 0) saves.push(patchTransfer(r.transferId, peerId, update));
    });


    await Promise.all(saves);
    await refreshResumable();
    setAvailableMatches((prev) => ({ ...prev, ...matches }));
  }, [refreshResumable]);

  const pushMessage = useCallback((from, text) => {
    messageId += 1;
    const alias = peerMetaRef.current[from]?.alias; // kept even after the peer leaves
    setMessages((prev) => [...prev, { id: messageId, from, alias, text, at: Date.now() }]);
  }, []);

  const updateTransfer = useCallback((peerId, fileId, patch) => {
    const k = tkey(peerId, fileId);
    const peerAlias = peerMetaRef.current[peerId]?.alias; // kept even after the peer leaves
    setTransfer((prev) => ({
      ...prev,
      [k]: { ...prev[k], peerId, fileId, ...(peerAlias && { peerAlias }), ...patch },
    }));
  }, []);

  const tryFinalize = useCallback(async (peerId, fileId) => {
    const state = incommingRef.current[peerId]?.[fileId];
    if (!state) return;
    if (!state.writable) return;
    if (!state.completeSignal) return;
    if (state.receivedCount < state.meta.totalChunks) return;


    if (state.finalizing) return;
    state.finalizing = true;

    await state.writable.close();
    await patchTransfer(fileId, peerId, { status: 'complete', receivedCount: state.receivedCount });
    refreshResumable();

    peersRef.current[peerId]?.control?.send(JSON.stringify({ type: 'file-verified', fileId }));

    // costs nothing and opening it never re-downloads the file.
    const file = await state.handle.getFile();
    const openUrl = PREVIEWABLE.test(file.type) ? URL.createObjectURL(file) : null;

    updateTransfer(peerId, fileId, { done: true, received: state.receivedCount, openUrl });
    log(`file completed from ${nameOf(peerMetaRef, peerId)}: ${state.meta.name}`);

    delete incommingRef.current[peerId][fileId];
    delete lastUpdateRef.current[tkey(peerId, fileId)];

  }, [log, updateTransfer, refreshResumable]);

  const getMissingChunks = (state) => missingChunks(state.bitmap, state.meta.totalChunks);

  const shouldOffer = (myId, theirId) => myId > theirId;

  const resendChunks = useCallback(async (peerId, fileId, pending, indices, chunkSize) => {
    const entry = peersRef.current[peerId];
    const fileChannel = entry?.fileChannel;
    if (!fileChannel || fileChannel.readyState !== 'open') return;

    let file = await pending.file;

    if (!file && pending.handle) {
      const ok = await ensureReadPermission(pending.handle);
      if (!ok) { log('lost read permission , cannot resume'); return; }
      file = await pending.handle.getFile();
    }

    if (!file) { log('no file available to resume'); return; }

    const k = tkey(peerId, fileId);
    fileChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    const waitForBuffer = () => new Promise((resolve, reject) => {
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

    log(`resending ${indices.length} chunks to ${nameOf(peerMetaRef, peerId)}`);

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
          updateTransfer(peerId, fileId, {
            resending: true,
            resent: done,
            resendTotal: indices.length,
            sent: pending.meta.totalChunks - indices.length + done,
          });
        }
      }

      updateTransfer(peerId, fileId, { resending: false });

      entry.control?.send(JSON.stringify({ type: 'file-complete', fileId }));
      log(`resend complete to ${nameOf(peerMetaRef, peerId)}`);
    }
    catch (e) {
      log(`resend interrupted to ${nameOf(peerMetaRef, peerId)}: ${e.message}`);
      updateTransfer(peerId, fileId, { resending: false, interrupted: true });
    }

  }, [log, updateTransfer]);

  const handleControlMessage = useCallback((peerId, rawMsg) => {
    const msg = JSON.parse(rawMsg);

    if (msg.type === 'chat') {
      pushMessage(peerId, msg.text);
      return;
    }

    if (msg.type === 'resumable') {
      msg.transfers.forEach((remote) => {
        const k = tkey(peerId, remote.transferId);

        if (remote.role === 'sender') {
          const local = incommingRef.current[peerId]?.[remote.transferId];
          if (!local) return;

          const missing = getMissingChunks(local);
          updateTransfer(peerId, remote.transferId, {
            matched: true,
            interrupted: false,
            name: remote.fileName,
            size: remote.fileSize,
            total: remote.totalChunks,
            received: countBits(local.bitmap),
            direction: 'receiving',
          });

          // A dormant sender can't answer yet; it announces again once it resumes.
          if (missing.length > 0 && !remote.dormant) {
            peersRef.current[peerId]?.control?.send(JSON.stringify({
              type: 'resume-request', fileId: remote.transferId, missing,
            }));
            log(`match: ${remote.fileName} — ${missing.length} chunks missing`);
          }
          return;
        }

        if (remote.role === 'receiver') {
          const pending = sendingRef.current[k];
          if (!pending) return;

          updateTransfer(peerId, remote.transferId, {
            matched: true,
            interrupted: false,
            name: remote.fileName,
            total: remote.totalChunks,
            sent: remote.have,
            direction: 'sending',
          });
          log(`match: ${remote.fileName} — peer has ${remote.have}/${remote.totalChunks}`);
        }
      });

      markMatches(peerId, msg.transfers).catch((e) => log(`match check failed: ${e.message}`));
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
        bitmap: createBitmap(msg.totalChunks),
        receivedCount: 0,
        meta: msg,
      }
      updateTransfer(peerId, msg.fileId, {
        name: msg.name,
        size: msg.size,
        received: 0,
        total: msg.totalChunks,
        done: false,
        accepted: false,
        resumable: msg.resumable !== false,
        direction: 'receiving',
      });
      log(`incomming file : ${msg.name} (${msg.totalChunks} chunks)`)
      return;
    }

    if (msg.type === 'file-accept') {
      const k = tkey(peerId, msg.fileId);
      const resolver = pendingAcceptRef.current[k];
      if (resolver) {
        resolver(msg.resumable !== false);
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
      resendChunks(peerId, msg.fileId, pending, msg.missing, pending.meta.chunkSize);
      return;
    }

    if (msg.type === 'progress') {
      patchTransfer(msg.fileId, peerId, { peerHave: msg.have }).catch(() => { });
      return;
    }

    if (msg.type === 'file-verified') {
      updateTransfer(peerId, msg.fileId, { done: true });
      delete sendingRef.current[tkey(peerId, msg.fileId)];
      patchTransfer(msg.fileId, peerId, { status: 'complete' }).catch(() => { });
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

  }, [log, pushMessage, updateTransfer, tryFinalize, resendChunks, markMatches]);

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

    if (!hasBit(state.bitmap, index)) {
      setBit(state.bitmap, index);
      state.receivedCount += 1;
    }

    //performance improvement
    const k = tkey(peerId, fileId);
    const now = performance.now()
    const last = lastUpdateRef.current[k] || 0;
    if (now - last > 100 || state.receivedCount === state.meta.totalChunks) {
      lastUpdateRef.current[k] = now;
      updateTransfer(peerId, fileId, { received: state.receivedCount });
    }

    const lastFlush = lastFlushRef.current[k] || 0;
    if (now - lastFlush > 5000) {
      lastFlushRef.current[k] = now;
      patchTransfer(fileId, peerId, {
        bitmap: state.bitmap,
        receivedCount: state.receivedCount,
      }).catch((e) => log('bitmap flush failed: ' + e.message));

      // Only the receiver knows what arrived; tell the sender so its resume card can show it.
      const control = peersRef.current[peerId]?.control;
      if (control?.readyState === 'open') {
        control.send(JSON.stringify({ type: 'progress', fileId, have: countBits(state.bitmap) }));
      }
    }

    tryFinalize(peerId, fileId);

  }, [log, updateTransfer, tryFinalize]);

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
      log(`resume: asking ${nameOf(peerMetaRef, peerId)} for ${missing.length} chunks`);
    });

  }, [log, updateTransfer]);

  const announceResumable = useCallback(async (peerId) => {
    const control = peersRef.current[peerId]?.control;
    if (control?.readyState !== 'open') return;

    const entries = [];

    // receiving: rehydrated or in-progress incoming transfers
    Object.entries(incommingRef.current[peerId] || {}).forEach(([transferId, state]) => {
      if (state.finalizing) return;
      entries.push({
        transferId,
        role: 'receiver',
        fileName: state.meta.name,
        totalChunks: state.meta.totalChunks,
        have: countBits(state.bitmap),
      });
    });

    // sending: files we still hold for this peer
    Object.entries(sendingRef.current).forEach(([k, pending]) => {
      if (!k.startsWith(`${peerId}:`)) return;
      entries.push({
        transferId: pending.meta.fileId,
        role: 'sender',
        fileName: pending.meta.name,
        fileSize: pending.meta.size,
        totalChunks: pending.meta.totalChunks,
        chunkSize: pending.meta.chunkSize,
      });
    });

    // stored: unfinished records from earlier sessions, not yet rehydrated
    const live = new Set(entries.map((e) => e.transferId));
    const stored = await listTransfers(peerId).catch(() => []);
    stored
      .filter((r) => r.status !== 'complete' && r.status !== 'stale' && !live.has(r.transferId))
      .forEach((r) => {
        entries.push({
          transferId: r.transferId,
          role: r.role,
          fileName: r.fileName,
          fileSize: r.fileSize,
          totalChunks: r.totalChunks,
          chunkSize: r.chunkSize,
          ...(r.role === 'receiver' && { have: countBits(r.bitmap) }),
          dormant: true,
        });
      });

    if (control.readyState !== 'open') return; // closed while we read IndexedDB
    control.send(JSON.stringify({ type: 'resumable', transfers: entries }));
    log(`announced ${entries.length} resumable transfer(s) to ${nameOf(peerMetaRef, peerId)}`);
  }, [log]);

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
      ch.onopen = () => { log(`control channel open: ${nameOf(peerMetaRef, peerId)}`); announceResumable(peerId); };
      ch.onclose = () => log(`control channel closed: ${nameOf(peerMetaRef, peerId)}`);
      ch.onmessage = (e) => handleControlMessage(peerId, e.data);
    }

    const wireFile = (ch) => {
      entry.fileChannel = ch;
      ch.binaryType = 'arraybuffer';
      ch.onopen = () => log(`file channel open: ${nameOf(peerMetaRef, peerId)}`);
      ch.onclose = () => log(`file chanel closed: ${nameOf(peerMetaRef, peerId)}`);
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

  }, [log, handleControlMessage, handleFileChunck, announceResumable]);

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
          peerMetaRef.current[p.id] = { alias: p.alias };
          peersRef.current[p.id]?.pc.close();
          delete peersRef.current[p.id];
          createPeerConnection(p.id, shouldOffer(selfIdRef.current, p.id));
        });
        return;
      }

      if (msg.type === 'peer-joined') {

        if (msg.peerId === selfIdRef.current) return;

        peerMetaRef.current[msg.peerId] = { alias: msg.alias };
        const stale = peersRef.current[msg.peerId];
        if (stale) {
          stale.pc.close();
          delete peersRef.current[msg.peerId];
          log(`peer reconnected : ${nameOf(peerMetaRef, msg.peerId)}`);
        } else {
          log(`peer joined: ${nameOf(peerMetaRef, msg.peerId)}`);
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

        Object.entries(incommingRef.current[msg.peerId] || {}).forEach(([fileId, state]) => {
          updateTransfer(msg.peerId, fileId, { interrupted: true });
          patchTransfer(fileId, msg.peerId, {
            bitmap: state.bitmap,
            receivedCount: state.receivedCount,
            status: 'paused'
          }).catch(() => { });
        });

        delete peersRef.current[msg.peerId];

        setPeers((prev) => prev.filter((p) => p.id !== msg.peerId));
        setAvailableMatches((prev) => Object.fromEntries(
          Object.entries(prev).filter(([key]) => !key.endsWith(`:${msg.peerId}`)),
        ));

        log(`peer left : ${nameOf(peerMetaRef, msg.peerId)}`);
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

  const leaveRoom = useCallback(() => {
    Object.values(peersRef.current).forEach(({ pc, control, fileChannel }) => {
      control?.close();
      fileChannel?.close();
      pc.close();
    })
    peersRef.current = {};

    wsRef.current?.close();
    wsRef.current = null;

    if (persist) {
      Object.entries(incommingRef.current).forEach(([peerId, files]) => {
        Object.entries(files).forEach(([fileId, state]) => {
          updateTransfer(peerId, fileId, { interrupted: true, paused: true });
          patchTransfer(fileId, peerId, {
            bitmap: state.bitmap,
            receivedCount: state.receivedCount,
            status: 'paused',
          }).catch(() => { });
        })
      })
      refreshResumable();
      log('left room - progress kept');
    }
    else {
      Object.values(incommingRef.current).forEach((files) => {
        Object.values(files).forEach((state) => {
          if (state.writable && !state.finalizing) {
            state.writable.close().catch(() => { });
          };
        })
      })
      incommingRef.current = {};
      sendingRef.current = {};
      pendingAcceptRef.current = {};
      lastUpdateRef.current = {};
      setTransfer({});
      log('left room - progress discarded');
    }

    setPeers([]);
    setAvailableMatches({});
    setRoomCode(null);
    setSignaling('idle');
    setSelfId(null);
    log('disconnect');

  }, [log, updateTransfer, persist, refreshResumable]);

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

    // Checkpoint only when both sides keep progress; either one can opt out.
    const resumable = persist && state.meta.resumable !== false;
    if (resumable) {
      await saveTransfer({
        transferId: fileId,
        peerId,
        peerAlias: peerMetaRef.current[peerId]?.alias ?? null,
        role: 'receiver',
        fileName: state.meta.name,
        fileSize: state.meta.size,
        chunkSize: state.meta.chunkSize,
        totalChunks: state.meta.totalChunks,
        handle,
        bitmap: state.bitmap,
        receivedCount: 0,
        status: 'active',
        createdAt: Date.now(),
      });
    }

    updateTransfer(peerId, fileId, { accepted: true, savedName: handle.name, resumable });
    peersRef.current[peerId]?.control?.send(JSON.stringify({ type: 'file-accept', fileId, resumable }));
    log(`accepted from ${nameOf(peerMetaRef, peerId)}: ${state.meta.name}`);
  }, [log, updateTransfer, persist]);

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

  const sendFiletoPeer = useCallback(async (source, peerId) => {
    const entry = peersRef.current[peerId];
    const control = entry?.control;
    const fileChannel = entry?.fileChannel;

    if (!control || !fileChannel || fileChannel.readyState != 'open') {
      log('channels are not ready');
      return;
    }

    const handle = isHandle(source) ? source : null;

    if (handle) {
      const ok = await ensureReadPermission(handle);
      if (!ok) {
        log(`no read permission for ${handle.name}`);
        return;
      }
    }

    const file = handle ? await handle.getFile() : source;
    const fileId = await computeTransferId(file);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const k = tkey(peerId, fileId);

    sendingRef.current[k] = {
      handle,
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
      resumable: persist,
    }))

    // Shown before the wait so the sender can see the file is pending approval.
    updateTransfer(peerId, fileId, {
      name: file.name,
      size: file.size,
      sent: 0,
      total: totalChunks,
      done: false,
      accepted: false,
      resumable: persist,
      direction: 'sending',
    })

    const peerResumable = await new Promise((resolve, reject) => {
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

    log(`peer accepted, sending chunks: ${nameOf(peerMetaRef, peerId)}`);
    const resumable = persist && peerResumable;
    updateTransfer(peerId, fileId, { accepted: true, resumable });

    // Checkpoint only when both sides keep progress. Without a handle (e.g. Firefox) the file can't be reopened after a reload, so resuming asks to pick it again.
    if (resumable) {
      await saveTransfer({
        transferId: fileId,
        peerId,
        peerAlias: peerMetaRef.current[peerId]?.alias ?? null,
        role: 'sender',
        fileName: file.name,
        fileSize: file.size,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        handle,
        needsReselect: !handle,
        bitmap: null,
        status: 'active',
        createdAt: Date.now(),
      });
    }

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
      delete lastUpdateRef.current[k];
      log(`sent file to ${nameOf(peerMetaRef, peerId)}: ${file.name}`);
    }
    catch (e) {
      log(`transfer interrupted to ${nameOf(peerMetaRef, peerId)}: ${e.message}`);
      updateTransfer(peerId, fileId, { interrupted: true });
      patchTransfer(fileId, peerId, { status: 'paused' }).catch(() => { });
      reader.cancel().catch(() => { });
    }

  }, [log, updateTransfer, persist]);

  const sendFile = useCallback(async (source, targetIds) => {
    const targets = targetIds?.length ? targetIds : Object.keys(peersRef.current);
    await Promise.allSettled(targets.map((peerId) => sendFiletoPeer(source, peerId)))
  }, [sendFiletoPeer])

  const resumeReceive = useCallback(async (record) => {
    const ok = await grantPermission(record);
    if (!ok) {
      log(`permission denied for ${record.fileName}`);
      return false;
    }

    const writable = await record.handle.createWritable({ keepExistingData: true });

    if (!incommingRef.current[record.peerId]) incommingRef.current[record.peerId] = {};
    incommingRef.current[record.peerId][record.transferId] = {
      handle: record.handle,
      writable,
      accepted: true,
      completeSignal: false,
      finalizing: false,
      bitmap: record.bitmap,
      receivedCount: countBits(record.bitmap),
      meta: {
        fileId: record.transferId,
        name: record.fileName,
        size: record.fileSize,
        chunkSize: record.chunkSize,
        totalChunks: record.totalChunks,
      }
    }

    updateTransfer(record.peerId, record.transferId, {
      name: record.fileName,
      size: record.fileSize,
      total: record.totalChunks,
      received: countBits(record.bitmap),
      direction: 'receiving',
      accepted: true,
      done: false,
      paused: false,
      interrupted: false,
    })

    log(`resumed receive: ${record.fileName} (${countBits(record.bitmap)}/${record.totalChunks})`);
    return true;

  }, [log, updateTransfer])

  const resumeSend = useCallback(async (record, reselectedFile) => {
    let file;
    if (record.handle) {
      const ok = await grantPermission(record);
      if (!ok) {
        log(`permission denied for ${record.fileName}`);
        return false;
      }
      file = await record.handle.getFile();
    } else if (reselectedFile) {
      file = reselectedFile;
    } else {
      return false;
    }

    // The hash is what stops us resuming onto the wrong file.
    const unchanged = file.size === record.fileSize
      && await computeTransferId(file) === record.transferId;
    if (!unchanged) {
      if (reselectedFile) return 'different-file';
      log(`file changed since this transfer started: ${record.fileName}`);
      await patchTransfer(record.transferId, record.peerId, { status: 'stale' });
      return false;
    }

    const k = tkey(record.peerId, record.transferId);
    sendingRef.current[k] = {
      handle: record.handle,
      file,
      meta: {
        fileId: record.transferId,
        name: record.fileName,
        size: record.fileSize,
        totalChunks: record.totalChunks,
        chunkSize: record.chunkSize,
      },
    };

    updateTransfer(record.peerId, record.transferId, {
      name: record.fileName,
      size: record.fileSize,
      total: record.totalChunks,
      sent: record.peerHave ?? 0,
      direction: 'sending',
      accepted: true,
      done: false,
      paused: false,
      interrupted: false,
    });

    log(`resumed send: ${record.fileName}`);
    return true;
  }, [log, updateTransfer]);

  const resumeTransfer = useCallback(async (record, reselectedFile) => {
    const key = `${record.transferId}:${record.peerId}`;
    setResumeBusy(key);
    try {
      const result = record.role === 'receiver'
        ? await resumeReceive(record)
        : await resumeSend(record, reselectedFile);

      if (result === 'different-file') return "That's a different file";
      if (!result) {
        await refreshResumable();
        return null;
      }

      await patchTransfer(record.transferId, record.peerId, { status: 'active' });
      await refreshResumable();

      // The receiver asks for its gaps; the sender tells the receiver it's live again.
      if (record.role === 'receiver') requestResume(record.peerId);
      else await announceResumable(record.peerId);
      return null;
    } catch (e) {
      log(`resume failed for ${record.fileName}: ${e.message}`);
      return null;
    } finally {
      setResumeBusy(null);
    }
  }, [log, resumeReceive, resumeSend, refreshResumable, requestResume, announceResumable]);

  const discardTransfer = useCallback(async (record) => {

    // A partial received file is useless alone; delete it where the browser allows.
    if (record.role === 'receiver') {
      const canDelete = typeof record.handle?.remove === 'function';
      const ok = window.confirm(canDelete
        ? `Discard "${record.fileName}"? The partially received file will be deleted.`
        : `Discard "${record.fileName}"? The partial file stays on your disk — delete it manually if you don't want it.`);

      if (!ok) return;

      if (canDelete) {
        await record.handle.remove()
          .catch(() => log(`could not delete partial file: ${record.fileName}`));
      }
    }
    await deleteTransfer(record.transferId, record.peerId);
    await refreshResumable();
    log(`discarded: ${record.fileName}`);
  }, [log, refreshResumable]);

  useEffect(() => {
    refreshResumable();
    pruneOld().catch(() => { });
  }, [refreshResumable]);

  return { peers, signaling, roomCode, selfId, messages, logs, transfers, createRoom, joinRoom, leaveRoom, persist, setPersist, sendMessage, sendFile, acceptFile, resumable, resumeBusy, availableMatches, resumeTransfer, discardTransfer };
}
