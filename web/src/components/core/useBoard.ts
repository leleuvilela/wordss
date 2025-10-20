import { useWebSocketContext } from "@/contexts/WebSocketContext";
import type { Position } from "@/types";

export function useBoard() {
  const { connectionStatus, lastMessage, sendMessage } = useWebSocketContext();

  function getChunk({
    chunkRow,
    chunkCol,
  }: {
    chunkRow: number;
    chunkCol: number;
  }) {
    sendMessage({ type: "getChunk", chunkCol, chunkRow });
  }

  function getRegion({
    startRow,
    startCol,
    endRow,
    endCol,
  }: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }) {
    sendMessage({ type: "getRegion", startRow, startCol, endRow, endCol });
  }

  function validate(coords: Position[]) {
    sendMessage({ type: "validate", coords });
  }

  function getStats() {
    sendMessage({ type: "getStats" });
  }

  return { getChunk, getRegion, validate, getStats, connectionStatus, lastMessage };
}
