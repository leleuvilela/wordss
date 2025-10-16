import { GameBoard } from "./components/game-board";
import { Header } from "./components/header";

function App() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <GameBoard />
    </div>
  );
}

export default App;
