import { useEffect, useRef, useState, useCallback } from 'react'

const SIGNAL = `ws://localhost:8080/api/v1/ws`
const CHUNK_SIZE = 64 * 1024;
const BUFFER_LOW_THRESHOLD = CHUNK_SIZE * 4;

let messageId = 0;

export function useWebRTC() {
  const [status, setStatus] = useState('idle');
  const [signaling, setSignaling] = useState('connecting');
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [transfers, setTransfer] = useState({});

  const wsRef = useRef(null);
  const pcRef = useRef(null);

  const controlRef = useRef(null);
  const fileChannelRef = useRef(null);

  const incommingRef = useRef({});
  const lastUpdateRef = useRef({});

  const log = useCallback((msg) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const pushMessage = useCallback((from, text) => {
    messageId += 1;
    setMessages((prev) => [...prev, { id: messageId, from, text, at: Date.now() }]);
  }, []);

  const updateTransfer = useCallback((fileId, patch) => {
    setTransfer((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], ...patch },
    }));
  }, []);

  const tryFinalize = useCallback((fileId) => {
    const state = incommingRef.current[fileId];
    if (!state) return;
    if (!state.completeSignal) return;               // sender hasn't said "done" yet
    if (state.received < state.meta.totalChunks) return; // chunks still missing

    const blob = new Blob(state.chunks);
    const url = URL.createObjectURL(blob);
    updateTransfer(fileId, { done: true, url, received: state.received });
    log(`file completed: ${state.meta.name}`);
    delete incommingRef.current[fileId];
  }, [log, updateTransfer]);

  const handleControlMessage = useCallback((rawMsg) => {
    const msg = JSON.parse(rawMsg);

    if (msg.type === 'chat') {
      pushMessage('peer', msg.text);
      return;
    }

    if (msg.type === 'file-meta') {
      incommingRef.current[msg.fileId] = {
        chunks: new Array(msg.totalChunks),
        received: 0,
        meta: msg,
      }
      updateTransfer(msg.fileId, {
        name: msg.name,
        size: msg.size,
        received: 0,
        total: msg.totalChunks,
        done: false,
        direction: 'receiving',
      });
      log(`incomming file : ${msg.name} (${msg.totalChunks} chunks)`)
      return;
    }

    if (msg.type === 'file-complete') {
      const state = incommingRef.current[msg.fileId];
      if (!state) return;
      state.completeSignal = true;
      tryFinalize(msg.fileId);
    }

  }, [log, pushMessage, updateTransfer, tryFinalize]);

  const handleFileChunck = useCallback((buffer) => {
    const view = new DataView(buffer);
    const index = view.getUint32(0);
    const chunckData = buffer.slice(4);

    const fileId = Object.keys(incommingRef.current)[0];
    if (!fileId) return;

    const state = incommingRef.current[fileId];
    state.chunks[index] = chunckData;
    state.received += 1;

    //performance improvement
    const now = performance.now()
    const last = lastUpdateRef.current[fileId] || 0;
    if (now - last > 100 || state.received === state.meta.totalChunks) {
      lastUpdateRef.current[fileId] = now;
      updateTransfer(fileId, { received: state.received });
    }
    delete lastUpdateRef.current[fileId];
    tryFinalize(fileId);

  }, [updateTransfer, tryFinalize]);

  useEffect(() => {
    const ws = new WebSocket(SIGNAL);
    wsRef.current = ws;


    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pcRef.current = pc;

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

      if (msg.type === 'offer') {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", sdp: answer }))
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

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      setStatus(pc.connectionState);
    }

    pc.ondatachannel = (event) => {

      if (event.channel.label === 'control') {
        controlRef.current = event.channel;

        event.channel.onopen = () => log('control channel open');
        event.channel.onclose = () => log('control channel closed');
        event.channel.onmessage = (e) => handleControlMessage(e.data);

      } else if (event.channel.label === 'file') {
        fileChannelRef.current = event.channel;
        event.channel.binaryType = 'arraybuffer';

        event.channel.onopen = () => log('file channel open');
        event.channel.onclose = () => log('file channel closed');
        event.channel.onmessage = (e) => handleFileChunck(e.data);
      }
    }

    return () => {
      controlRef.current?.close();
      pc.close();
      ws.close();
    }

  }, [log, handleControlMessage, handleFileChunck]);

  const startConnection = useCallback(() => {
    const pc = pcRef.current;
    const ws = wsRef.current;

    const control = pc.createDataChannel('control');
    controlRef.current = control;

    control.onopen = () => log('control channel open');
    control.onclose = () => log('control channel closed');
    control.onmessage = (e) => handleControlMessage(e.data);

    // ordered false becuase we have our own reassembly logic as we tag every chunk
    const fileChannel = pc.createDataChannel('file', { ordered: false });
    fileChannelRef.current = fileChannel;
    fileChannel.binaryType = 'arraybuffer';
    fileChannel.onopen = () => log('file channel open');
    fileChannel.onclose = () => log('file channel closed');
    fileChannel.onmessage = (e) => handleFileChunck(e.data);

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
      });
  }, [log, handleControlMessage, handleFileChunck]);

  const sendMessage = useCallback((text) => {
    if (controlRef.current?.readyState === 'open') {
      controlRef.current.send(JSON.stringify({ type: 'chat', text }));
      pushMessage('me', text);
    } else {
      log("error: Data channel is closed")
    }
  }, [log, pushMessage]);

  const sendFile = useCallback(async (file) => {
    const control = controlRef.current;
    const fileChannel = fileChannelRef.current;

    if (!control || !fileChannel || fileChannel.readyState != 'open') {
      log('channels are not ready');
      return;
    }
    const fileId = `${file.name} - ${file.size} - ${Date.now()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    control.send(JSON.stringify({
      type: 'file-meta',
      fileId,
      name: file.name,
      size: file.size,
      totalChunks,
      chunkSize: CHUNK_SIZE,
    }))

    updateTransfer(fileId, {
      name: file.name,
      size: file.size,
      sent: 0,
      total: totalChunks,
      done: false,
      direction: 'sending',
    })

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
        const last = lastUpdateRef.current[fileId] || 0;
        if (now - last > 100 || index === totalChunks) {
          lastUpdateRef.current[fileId] = now;
          updateTransfer(fileId, { sent: index });
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
          const last = lastUpdateRef.current[fileId] || 0;
          if (now - last > 100 || index === totalChunks) {
            lastUpdateRef.current[fileId] = now;
            updateTransfer(fileId, { sent: index });
          }

        }
        break;
      }
    }

    control.send(JSON.stringify({ type: 'file-complete', fileId }));
    updateTransfer(fileId, { done: true });
    delete lastUpdateRef.current[fileId];
    log(`sent file: ${file.name}`);

  }, [log, updateTransfer]);

  return { status, signaling, messages, logs, transfers, startConnection, sendMessage, sendFile };
}
