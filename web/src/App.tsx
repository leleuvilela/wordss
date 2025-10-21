import { GameBoard } from "./components/game-board";
import { Header } from "./components/header";
import { WebSocketProvider } from "./contexts/WebSocketContext";

// Use environment variable if available, otherwise construct from current location
const WS_URL = import.meta.env.VITE_WS_URL ||
  (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
  window.location.host + '/ws';

function App() {
  return (
    <WebSocketProvider url={WS_URL}>
      <div className="h-screen flex flex-col">
        <Header />
        <GameBoard />
      </div>
    </WebSocketProvider>
  );
}

export default App;
