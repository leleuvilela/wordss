import { GameBoard } from "./components/game-board";
import { Header } from "./components/header";
import { WebSocketProvider } from "./contexts/WebSocketContext";

// Replace with your WebSocket server URL
const WS_URL = "ws://localhost:3001";

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
