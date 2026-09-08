import { useWebRTC } from './hooks/useWebRTC';
import { ActivityLog } from './components/ActivityLog';
import { ChatPanel } from './components/ChatPanel';
import { ConnectionBar } from './components/ConnectionBar';
import { FilePanel } from './components/FilePanel';
import { StatusPill } from './components/StatusPill';

function App() {
  const {
    status,
    signaling,
    messages,
    logs,
    transfers,
    startConnection,
    sendMessage,
    sendFile,
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

      <ConnectionBar signaling={signaling} peer={status} onConnect={startConnection} />

      <main className="workspace">
        <ChatPanel messages={messages} onSend={sendMessage} disabled={offline} />
        <FilePanel transfers={transfers} onSend={sendFile} disabled={offline} />
      </main>

      <ActivityLog entries={logs} />
    </div>
  );
}

export default App;
