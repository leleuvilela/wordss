import {
  useState,
  useRef,
  useEffect,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useBoard } from "../core/useBoard";
import type { Position } from "@/types";

// ==========================================
// Constants
// ==========================================

const CELL_SIZE = 60; // pixels
const CHUNK_LOAD_THRESHOLD = 2; // Load new chunks when within 2 chunks of edge

// ==========================================
// Helper Functions
// ==========================================

function getChunkKey(chunkRow: number, chunkCol: number): string {
  return `${chunkRow},${chunkCol}`;
}

function getCellFromChunks(
  chunks: ReturnType<typeof useBoard>["chunks"],
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

function getPositionKey(pos: Position): string {
  return `${pos[0]},${pos[1]}`;
}

// ==========================================
// Main Component
// ==========================================

export function GameBoard() {
  const {
    chunks,
    chunkSize,
    loadedChunkBounds,
    selectedCells,
    validatedWords,
    connectionStatus,
    requestChunksInRange,
    handleCellClick,
  } = useBoard();

  // UI State (kept in component)
  const [zoom, setZoom] = useState(1);
  const parentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
    x: number;
    y: number;
  } | null>(null);
  const hasDraggedRef = useRef(false);

  // Calculate board dimensions based on loaded chunks
  const rowCount =
    (loadedChunkBounds.maxRow - loadedChunkBounds.minRow + 1) * chunkSize;
  const colCount =
    (loadedChunkBounds.maxCol - loadedChunkBounds.minCol + 1) * chunkSize;

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
                    onClick={() => {
                      // Don't select cells if user was dragging
                      if (!hasDraggedRef.current) {
                        handleCellClick(globalRow, globalCol);
                      }
                    }}
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
