import { useWebRTC } from './hooks/useWebRTC';
import { ActivityLog } from './components/ActivityLog';
import { ChatPanel } from './components/ChatPanel';
import { ConnectionBar } from './components/ConnectionBar';
import { FilePanel } from './components/FilePanel';
import { StatusPill } from './components/StatusPill';
import { Icon } from './components/Icon';
import { hasFSA } from './lib/capabilities';

function App() {
  const {
    status,
    roomCode,
    messages,
    logs,
    transfers,
    createRoom,
    joinRoom,
    sendMessage,
    sendFile,
    acceptFile,
  } = useWebRTC();

  const offline = status !== 'connected';

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="header__title">eco3</h1>
          <p className="header__subtitle">Share text and files directly between peers</p>
        </div>
        <StatusPill state={status} />
      </header>

      {!hasFSA && (
        <p className="notice">
          <Icon name="alert" size={14} />
          Receiving files needs the File System Access API. Use a Chromium browser
          (Chrome, Edge, Brave, Arc) to receive — sending and chat work here.
        </p>
      )}

      <ConnectionBar
        roomCode={roomCode}
        peer={status}
        createRoom={createRoom}
        joinRoom={joinRoom}
      />

      <main className="workspace">
        <ChatPanel messages={messages} onSend={sendMessage} disabled={offline} />
        <FilePanel
          transfers={transfers}
          onSend={sendFile}
          onAccept={acceptFile}
          disabled={offline}
        />
      </main>

      <ActivityLog entries={logs} />
    </div>
  );
}

export default App;
