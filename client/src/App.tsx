import { ChatPanel } from './components/ChatPanel';
import { LogsPanel } from './components/LogsPanel';
import { useSocket } from './hooks/useSocket';

export function App() {
  const { messages, logs, thinking, connected, sendMessage } = useSocket();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark">MCP</span>
          <span>Демо travel-агента: Kiwi + Trivago</span>
        </div>
      </header>
      <main className="app-body">
        <ChatPanel messages={messages} thinking={thinking} connected={connected} onSend={sendMessage} />
        <LogsPanel logs={logs} />
      </main>
    </div>
  );
}
