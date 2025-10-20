import { useBoard } from "../core/useBoard";
import { Button } from "../ui/button";

export function Header() {
  const { getStats } = useBoard();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="text-gray-900">wordss</div>
      <Button onClick={getStats}>get</Button>
    </header>
  );
}
