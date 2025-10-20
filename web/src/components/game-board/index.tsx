import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useBoard } from "../core/useBoard";
import type { Grid, Position } from "@/types";

// ==========================================
// Constants
// ==========================================

const CELL_SIZE = 60; // pixels
const INITIAL_CHUNKS = 20; // Load 20x20 chunks initially
const CHUNK_LOAD_THRESHOLD = 2; // Load new chunks when within 2 chunks of edge

// ==========================================
// Types
// ==========================================

interface ChunkData {
  data: Grid;
  chunkSize: number;
}

type ChunkMap = Map<string, ChunkData>;

// ==========================================
// Helper Functions
// ==========================================

function getChunkKey(chunkRow: number, chunkCol: number): string {
  return `${chunkRow},${chunkCol}`;
}

function parseChunkKey(key: string): [number, number] {
  const [row, col] = key.split(",").map(Number);
  return [row, col];
}

function getCellFromChunks(
  chunks: ChunkMap,
  globalRow: number,
  globalCol: number,
  chunkSize: number,
): string {
  // Only handle non-negative coordinates
  if (globalRow < 0 || globalCol < 0) return "";

  const chunkRow = Math.floor(globalRow / chunkSize);
  const chunkCol = Math.floor(globalCol / chunkSize);
  const localRow = globalRow % chunkSize;
  const localCol = globalCol % chunkSize;

  const chunk = chunks.get(getChunkKey(chunkRow, chunkCol));
  if (!chunk) return "";

  return chunk.data[localRow]?.[localCol] || "";
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

function getPositionKey(pos: Position): string {
  return `${pos[0]},${pos[1]}`;
}

// ==========================================
// Main Component
// ==========================================

export function GameBoard() {
  const { getChunk, validate, lastMessage, connectionStatus } = useBoard();

  // State
  const [zoom, setZoom] = useState(1);
  const [chunks, setChunks] = useState<ChunkMap>(new Map());
  const [chunkSize, setChunkSize] = useState(16); // Default, will be updated from server
  const [loadedChunkBounds, setLoadedChunkBounds] = useState({
    minRow: 0,
    maxRow: 0,
    minCol: 0,
    maxCol: 0,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
    x: number;
    y: number;
  } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Position[]>([]);
  const [validatedWords, setValidatedWords] = useState<Set<string>>(new Set());
  const requestedChunksRef = useRef<Set<string>>(new Set());
  const hasDraggedRef = useRef(false);

  // Calculate board dimensions based on loaded chunks
  const rowCount =
    (loadedChunkBounds.maxRow - loadedChunkBounds.minRow + 1) * chunkSize;
  const colCount =
    (loadedChunkBounds.maxCol - loadedChunkBounds.minCol + 1) * chunkSize;

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
      getChunk({ chunkRow, chunkCol });
    },
    [getChunk],
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
  // WebSocket Message Handling
  // ==========================================

  useEffect(() => {
    if (!lastMessage) return;

    console.log("Received message:", lastMessage);

    if (lastMessage.type === "chunk") {
      const {
        chunkRow,
        chunkCol,
        data,
        chunkSize: serverChunkSize,
      } = lastMessage;
      const key = getChunkKey(chunkRow, chunkCol);

      console.log(`Received chunk [${chunkRow}, ${chunkCol}]`);

      setChunkSize(serverChunkSize);
      setChunks((prev) => {
        const next = new Map(prev);
        next.set(key, { data, chunkSize: serverChunkSize });
        return next;
      });

      // Update chunk bounds
      setLoadedChunkBounds((prev) => ({
        minRow: Math.min(prev.minRow, chunkRow),
        maxRow: Math.max(prev.maxRow, chunkRow),
        minCol: Math.min(prev.minCol, chunkCol),
        maxCol: Math.max(prev.maxCol, chunkCol),
      }));

      // Remove from requested set after a delay to prevent duplicate requests
      setTimeout(() => {
        requestedChunksRef.current.delete(key);
      }, 1000);
    } else if (lastMessage.type === "validation") {
      const { result, coords } = lastMessage;

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
      }

      // Clear selection after validation
      setSelectedCells([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load initial chunks once

  // ==========================================
  // Virtualizers
  // ==========================================

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_SIZE * zoom,
    overscan: 5,
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: colCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_SIZE * zoom,
    overscan: 5,
  });

  // ==========================================
  // Zoom Handlers
  // ==========================================

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.4));
  };

  // ==========================================
  // Drag Handlers
  // ==========================================

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!parentRef.current) return;
    hasDraggedRef.current = false;
    setHoveredCell(null);
    setDragStart({
      x: e.clientX + parentRef.current.scrollLeft,
      y: e.clientY + parentRef.current.scrollTop,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!parentRef.current) return;

    // Check if mouse is being held down (left button)
    if (e.buttons === 1 && dragStart.x !== 0) {
      const dx = dragStart.x - e.clientX;
      const dy = dragStart.y - e.clientY;

      // Mark as dragged if moved
      if (
        !hasDraggedRef.current &&
        (Math.abs(dx - parentRef.current.scrollLeft) > 3 ||
          Math.abs(dy - parentRef.current.scrollTop) > 3)
      ) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      parentRef.current.scrollLeft = dx;
      parentRef.current.scrollTop = dy;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
  };

  // ==========================================
  // Cell Selection and Validation
  // ==========================================

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      // Don't select cells if user was dragging
      if (hasDraggedRef.current) return;

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
            validate(cells);
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
    [validate],
  );

  // ==========================================
  // Auto-load Chunks on Scroll
  // ==========================================

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      // Throttle scroll handler to prevent excessive chunk requests

      const {
        scrollLeft,
        scrollTop,
        scrollWidth,
        scrollHeight,
        clientWidth,
        clientHeight,
      } = scrollElement;

      const threshold = CHUNK_LOAD_THRESHOLD * chunkSize * CELL_SIZE * zoom;

      // Check edges and request new chunks (only positive coordinates)
      if (scrollLeft <= threshold && loadedChunkBounds.minCol > 0) {
        // Near left edge - only if not at column 0
        const newMinCol = loadedChunkBounds.minCol - 1;
        requestChunksInRange(
          loadedChunkBounds.minRow,
          loadedChunkBounds.maxRow,
          newMinCol,
          newMinCol,
        );
      }

      if (scrollLeft + clientWidth >= scrollWidth - threshold) {
        // Near right edge
        const newMaxCol = loadedChunkBounds.maxCol + 1;
        requestChunksInRange(
          loadedChunkBounds.minRow,
          loadedChunkBounds.maxRow,
          newMaxCol,
          newMaxCol,
        );
      }

      if (scrollTop <= threshold && loadedChunkBounds.minRow > 0) {
        // Near top edge - only if not at row 0
        const newMinRow = loadedChunkBounds.minRow - 1;
        requestChunksInRange(
          newMinRow,
          newMinRow,
          loadedChunkBounds.minCol,
          loadedChunkBounds.maxCol,
        );
      }

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        // Near bottom edge
        const newMaxRow = loadedChunkBounds.maxRow + 1;
        requestChunksInRange(
          newMaxRow,
          newMaxRow,
          loadedChunkBounds.minCol,
          loadedChunkBounds.maxCol,
        );
      }
    };

    scrollElement.addEventListener("scroll", handleScroll);
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [loadedChunkBounds, chunkSize, zoom, requestChunksInRange]);

  // ==========================================
  // Position Board at Top-Left on Initial Load
  // ==========================================

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement || chunks.size === 0) return;

    const positionBoard = () => {
      // Start at top-left (0, 0) - only on initial load
      scrollElement.scrollLeft = 0;
      scrollElement.scrollTop = 0;
    };

    const timer = setTimeout(positionBoard, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // ==========================================
  // Re-measure on Zoom
  // ==========================================

  useEffect(() => {
    rowVirtualizer.measure();
    columnVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]); // Only re-measure when zoom changes, not when virtualizers change

  // ==========================================
  // Render
  // ==========================================

  // Convert virtual indices to global indices (only non-negative coordinates)
  const getGlobalRowIndex = (virtualIndex: number) => {
    const globalRow = virtualIndex + loadedChunkBounds.minRow * chunkSize;
    return Math.max(0, globalRow); // Ensure non-negative
  };

  const getGlobalColIndex = (virtualIndex: number) => {
    const globalCol = virtualIndex + loadedChunkBounds.minCol * chunkSize;
    return Math.max(0, globalCol); // Ensure non-negative
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-50">
      {/* Connection Status */}
      <div className="absolute top-4 left-4 z-10 bg-white px-3 py-1 rounded-md shadow-sm border">
        <span className="text-sm font-medium">
          Status:{" "}
          <span
            className={
              connectionStatus === "Connected"
                ? "text-green-600"
                : "text-orange-600"
            }
          >
            {connectionStatus}
          </span>
        </span>
        <span className="text-xs text-gray-500 ml-2">
          Chunks: {chunks.size}
        </span>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={handleZoomOut}
          size="icon"
          variant="outline"
          className="bg-white"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleZoomIn}
          size="icon"
          variant="outline"
          className="bg-white"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Coordinate Popover */}
      {hoveredCell && (
        <div
          className="fixed z-50 bg-black/80 text-white px-2 py-1 rounded text-xs font-mono pointer-events-none"
          style={{
            left: `${hoveredCell.x + 10}px`,
            top: `${hoveredCell.y + 10}px`,
          }}
        >
          [{hoveredCell.row}, {hoveredCell.col}]
        </div>
      )}

      {/* Virtualized Board Container */}
      <div
        ref={parentRef}
        className="w-full h-full overflow-auto scrollbar-hide"
        style={{
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${columnVirtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                const globalRow = getGlobalRowIndex(virtualRow.index);
                const globalCol = getGlobalColIndex(virtualColumn.index);
                const letter = getCellFromChunks(
                  chunks,
                  globalRow,
                  globalCol,
                  chunkSize,
                );
                const posKey = getPositionKey([globalRow, globalCol]);

                const isValidated = validatedWords.has(posKey);
                const isSelected = selectedCells.some(
                  ([r, c]) => r === globalRow && c === globalCol,
                );

                let cellClass =
                  "flex items-center justify-center border border-gray-300 transition-colors absolute top-0 left-0 cursor-pointer";

                if (isValidated) {
                  cellClass += " bg-green-500/40";
                } else if (isSelected) {
                  cellClass += " bg-blue-400/40";
                } else {
                  cellClass += " bg-white hover:bg-blue-50";
                }

                return (
                  <div
                    key={virtualColumn.key}
                    className={cellClass}
                    style={{
                      width: `${virtualColumn.size}px`,
                      height: `${virtualRow.size}px`,
                      transform: `translateX(${virtualColumn.start}px)`,
                    }}
                    onClick={() => handleCellClick(globalRow, globalCol)}
                    onMouseEnter={(e) => {
                      if (!isDragging) {
                        setHoveredCell((prev) => {
                          // Only update if coordinates changed
                          if (
                            prev &&
                            prev.row === globalRow &&
                            prev.col === globalCol
                          ) {
                            return prev;
                          }
                          return {
                            row: globalRow,
                            col: globalCol,
                            x: e.clientX,
                            y: e.clientY,
                          };
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      if (!isDragging) {
                        setHoveredCell(null);
                      }
                    }}
                  >
                    <span
                      className="text-gray-700 select-none font-medium"
                      style={{
                        fontSize: `${14 * zoom}px`,
                      }}
                    >
                      {letter}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
