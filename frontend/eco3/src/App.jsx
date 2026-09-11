import { useState, useMemo } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { ActivityLog } from './components/ActivityLog';
import { ChatPanel } from './components/ChatPanel';
import { ConnectionBar } from './components/ConnectionBar';
import { FilePanel } from './components/FilePanel';
import { PeerList } from './components/PeerList';
import { Identity } from './components/Identity';
import { ResumePanel } from './components/ResumePanel';
import { Icon } from './components/Icon';
import { hasFSA } from './lib/capabilities';

function App() {
  const {
    peers,
    signaling,
    roomCode,
    selfId,
    messages,
    logs,
    transfers,
    createRoom,
    joinRoom,
    leaveRoom,
    persist,
    setPersist,
    sendMessage,
    sendFile,
    acceptFile,
    resumable,
    resumeBusy,
    availableMatches,
    resumeTransfer,
    discardTransfer,
  } = useWebRTC();

  const [selected, setSelected] = useState([]);
  const [alias, setAlias] = useState('');

  const connectedPeers = useMemo(
    () => peers.filter((p) => p.state === 'connected'),
    [peers],
  );

  const offline = connectedPeers.length === 0;

  // Send only to peers that are both selected and actually connected.
  const targets = useMemo(() => {
    const connectedIds = connectedPeers.map((p) => p.id);
    if (selected.length === 0) return connectedIds; // none selected => broadcast
    return connectedIds.filter((id) => selected.includes(id));
  }, [connectedPeers, selected]);

  const togglePeer = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="header__title">eco3</h1>
          <p className="header__subtitle">Share text and files directly between peers</p>
        </div>
        <Identity alias={alias} onAlias={setAlias} selfId={selfId} />
      </header>

      {!hasFSA && (
        <p className="notice">
          <Icon name="alert" size={14} />
          Receiving files needs the File System Access API. Use a Chromium browser
          (Chrome, Edge, Brave, Arc) to receive — sending and chat work here.
        </p>
      )}

      <ResumePanel
        records={resumable}
        availableMatches={availableMatches}
        onResume={resumeTransfer}
        onDiscard={discardTransfer}
        busyKey={resumeBusy}
      />

      <ConnectionBar
        roomCode={roomCode}
        signaling={signaling}
        peerCount={connectedPeers.length}
        createRoom={() => createRoom(alias)}
        joinRoom={(code) => joinRoom(code, alias)}
        leaveRoom={leaveRoom}
        persist={persist}
        onPersist={setPersist}
      />

      <PeerList peers={peers} selected={selected} onToggle={togglePeer} />

      <main className="workspace">
        <ChatPanel
          messages={messages}
          onSend={(text) => sendMessage(text, targets)}
          targetCount={targets.length}
          disabled={offline}
        />
        <FilePanel
          transfers={transfers}
          onSend={(source) => sendFile(source, targets)}
          onAccept={acceptFile}
          persist={persist}
          targetCount={targets.length}
          disabled={offline}
        />
      </main>

      <ActivityLog entries={logs} />
    </div>
  );
}

export default App;
