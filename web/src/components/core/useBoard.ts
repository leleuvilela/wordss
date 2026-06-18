import { useWebSocketContext } from "@/contexts/useWebSocketContext";
import type {
  Position,
  Grid,
  ChunkResponse,
  ValidateResponse,
  WordFoundResponse,
  FoundWordsListResponse,
  VisibleWordsResponse,
} from "@/types";
import { useEffect, useState, useCallback, useRef } from "react";

// ==========================================
// Constants
// ==========================================

const INITIAL_CHUNKS = 5; // Load 20x20 chunks initially

// Debug-only: when enabled, ask the server for word coordinates so the board
// can highlight where words are. Build-time env, defaults off — keep it unset
// in production.
const DEBUG_WORDS = import.meta.env.VITE_DEBUG_WORDS === "true";

// ==========================================
// Types
// ==========================================

interface ChunkData {
  data: Grid;
  chunkSize: number;
}

type ChunkMap = Map<string, ChunkData>;

interface LoadedChunkBounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

// ==========================================
// Helper Functions
// ==========================================

function getChunkKey(chunkRow: number, chunkCol: number): string {
  return `${chunkRow},${chunkCol}`;
}

function getPositionKey(pos: Position): string {
  return `${pos[0]},${pos[1]}`;
}

function getCellsBetween(start: Position, end: Position): Position[] | null {
  const [startRow, startCol] = start;
  const [endRow, endCol] = end;

  const rowDiff = endRow - startRow;
  const colDiff = endCol - startCol;

  // Check if it's a valid line (horizontal, vertical, or diagonal)
  const isHorizontal = rowDiff === 0;
  const isVertical = colDiff === 0;
  const isDiagonal = Math.abs(rowDiff) === Math.abs(colDiff);

  if (!isHorizontal && !isVertical && !isDiagonal) {
    return null; // Not a valid line
  }

  const cells: Position[] = [];
  const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
  const rowStep = rowDiff === 0 ? 0 : rowDiff / steps;
  const colStep = colDiff === 0 ? 0 : colDiff / steps;

  for (let i = 0; i <= steps; i++) {
    cells.push([
      startRow + Math.round(rowStep * i),
      startCol + Math.round(colStep * i),
    ]);
  }

  return cells;
}

export function useBoard() {
  const { connectionStatus, lastMessage, sendMessage } = useWebSocketContext();

  // ==========================================
  // Game State
  // ==========================================

  const [chunks, setChunks] = useState<ChunkMap>(new Map());
  const [chunkSize, setChunkSize] = useState(16); // Default, will be updated from server
  const [loadedChunkBounds, setLoadedChunkBounds] = useState<LoadedChunkBounds>(
    {
      minRow: 0,
      maxRow: 0,
      minCol: 0,
      maxCol: 0,
    },
  );
  const [selectedCells, setSelectedCells] = useState<Position[]>([]);
  const [validatedWords, setValidatedWords] = useState<Set<string>>(new Set());
  const [visibleWords, setVisibleWords] = useState<
    Array<{ word: string; founded: boolean; coords?: Position[] }>
  >([]);
  const requestedChunksRef = useRef<Set<string>>(new Set());

  // ==========================================
  // Chunk Management
  // ==========================================

  const requestChunk = useCallback(
    (chunkRow: number, chunkCol: number) => {
      // Only request non-negative chunks
      if (chunkRow < 0 || chunkCol < 0) return;

      const key = getChunkKey(chunkRow, chunkCol);
      if (requestedChunksRef.current.has(key)) return;

      requestedChunksRef.current.add(key);
      console.log(`Requesting chunk [${chunkRow}, ${chunkCol}]`);
      sendMessage({ type: "getChunk", chunkCol, chunkRow });
    },
    [sendMessage],
  );

  const requestChunksInRange = useCallback(
    (minRow: number, maxRow: number, minCol: number, maxCol: number) => {
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          requestChunk(row, col);
        }
      }
    },
    [requestChunk],
  );

  // ==========================================
  // Cell Selection and Validation
  // ==========================================

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      const newCell: Position = [row, col];

      setSelectedCells((prev) => {
        if (prev.length === 0) {
          // First cell selection
          return [newCell];
        } else if (prev.length === 1) {
          // Second cell selection - validate the word
          const cells = getCellsBetween(prev[0], newCell);

          if (cells) {
            // Valid line - send validation request
            console.log("Validating cells:", cells);
            sendMessage({ type: "validate", coords: cells });
            return cells; // Show the selected path
          } else {
            // Invalid line - reset and start with this cell
            return [newCell];
          }
        } else {
          // Already selected - start new selection
          return [newCell];
        }
      });
    },
    [sendMessage],
  );

  // ==========================================
  // WebSocket Message Handling
  // ==========================================

  function handleChunk(message: ChunkResponse) {
    const { chunkRow, chunkCol, data, chunkSize: serverChunkSize } = message;
    const key = getChunkKey(chunkRow, chunkCol);

    console.log(`Received chunk [${chunkRow}, ${chunkCol}]`);

    setChunkSize(serverChunkSize);
    setChunks((prev) => {
      const next = new Map(prev);
      next.set(key, { data, chunkSize: serverChunkSize });
      return next;
    });

    setLoadedChunkBounds((prev) => ({
      minRow: Math.min(prev.minRow, chunkRow),
      maxRow: Math.max(prev.maxRow, chunkRow),
      minCol: Math.min(prev.minCol, chunkCol),
      maxCol: Math.max(prev.maxCol, chunkCol),
    }));

    setTimeout(() => {
      requestedChunksRef.current.delete(key);
    }, 1000);
  }

  function handleValidation(message: ValidateResponse) {
    const { result, coords } = message;

    console.log("Validation result:", result, coords);

    if (result) {
      // Valid word found - add all coordinates to validated set
      setValidatedWords((prev) => {
        const next = new Set(prev);
        coords.forEach((pos) => {
          next.add(getPositionKey(pos));
        });
        return next;
      });
      markWordFounded(result);
    }

    // Clear selection after validation
    setSelectedCells([]);
  }

  function handleWordFound(message: WordFoundResponse) {
    const { word, coords } = message;

    setValidatedWords((prev) => {
      const next = new Set(prev);
      coords.forEach((pos) => {
        next.add(getPositionKey(pos));
      });
      return next;
    });
    markWordFounded(word);
  }

  // Flip a word to founded in the on-screen list without waiting for a refresh.
  function markWordFounded(word: string) {
    setVisibleWords((prev) =>
      prev.map((w) => (w.word === word ? { ...w, founded: true } : w)),
    );
  }

  function handleVisibleWords(message: VisibleWordsResponse) {
    setVisibleWords(message.words);
  }

  function handleFoundWordsList(message: FoundWordsListResponse) {
    const { foundWords } = message;

    const newValidatedWords = new Set<string>();

    foundWords.forEach((word) => {
      word.coords.forEach((pos) => {
        newValidatedWords.add(getPositionKey(pos));
      });
    });

    setValidatedWords(newValidatedWords);
  }

  useEffect(() => {
    if (!lastMessage) return;

    console.log("Received message:", lastMessage);

    switch (lastMessage.type) {
      case "chunk":
        handleChunk(lastMessage);
        break;
      case "validation":
        handleValidation(lastMessage);
        break;
      case "wordFound":
        handleWordFound(lastMessage);
        break;
      case "foundWordsList":
        handleFoundWordsList(lastMessage);
        break;
      case "visibleWords":
        handleVisibleWords(lastMessage);
        break;
    }
  }, [lastMessage]);

  // ==========================================
  // Initial Load
  // ==========================================

  useEffect(() => {
    // Load initial chunks starting at (0, 0) - only once on mount
    for (let row = 0; row < INITIAL_CHUNKS; row++) {
      for (let col = 0; col < INITIAL_CHUNKS; col++) {
        requestChunk(row, col);
      }
    }
    getFoundWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load initial chunks once

  // ==========================================
  // Public API
  // ==========================================

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

  function getStats() {
    sendMessage({ type: "getStats" });
  }

  function getFoundWords() {
    sendMessage({ type: "getFoundWords" });
  }

  const requestVisibleWords = useCallback(
    (startRow: number, startCol: number, endRow: number, endCol: number) => {
      sendMessage({
        type: "getVisibleWords",
        startRow,
        startCol,
        endRow,
        endCol,
        debug: DEBUG_WORDS,
      });
    },
    [sendMessage],
  );

  return {
    // State
    chunks,
    chunkSize,
    loadedChunkBounds,
    selectedCells,
    validatedWords,
    visibleWords,
    connectionStatus,
    // Functions
    requestChunk,
    requestChunksInRange,
    requestVisibleWords,
    handleCellClick,
    getRegion,
    getStats,
    getFoundWords,
  };
}
