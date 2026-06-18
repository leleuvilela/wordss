import {
  useState,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { ZoomIn, ZoomOut, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useBoard } from "../core/useBoard";
import type { Position } from "@/types";

// ==========================================
// Constants
// ==========================================

const CELL_SIZE = 60; // pixels
const CHUNK_LOAD_THRESHOLD = 2; // Load new chunks when within 2 chunks of edge

// Debug-only: highlight word cells in red. Build-time env, defaults off.
// Requires the server to run with DEBUG_WORDS=true to receive coordinates.
const DEBUG_WORDS = import.meta.env.VITE_DEBUG_WORDS === "true";

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
    visibleWords,
    connectionStatus,
    requestChunksInRange,
    requestVisibleWords,
    handleCellClick,
  } = useBoard();

  // UI State (kept in component)
  const [zoom, setZoom] = useState(1);
  // Mobile-only: collapse state for the bottom-sheet word list. Ignored on
  // desktop, where the list is always shown (see sm:block below).
  const [wordsOpen, setWordsOpen] = useState(false);
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

    const checkEdges = () => {
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

    scrollElement.addEventListener("scroll", checkEdges);

    // Also check immediately: zoom-out or new chunks can expose edges
    // without any scroll event. rAF waits for the post-zoom re-measure.
    const rafId = requestAnimationFrame(checkEdges);

    return () => {
      scrollElement.removeEventListener("scroll", checkEdges);
      cancelAnimationFrame(rafId);
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
  // Request Words Visible in the Current Viewport
  // ==========================================

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      const cell = CELL_SIZE * zoom;
      const rowOffset = loadedChunkBounds.minRow * chunkSize;
      const colOffset = loadedChunkBounds.minCol * chunkSize;

      const { scrollTop, scrollLeft, clientHeight, clientWidth } =
        scrollElement;

      const startRow = Math.max(0, Math.floor(scrollTop / cell) + rowOffset);
      const endRow = Math.max(
        0,
        Math.ceil((scrollTop + clientHeight) / cell) + rowOffset,
      );
      const startCol = Math.max(0, Math.floor(scrollLeft / cell) + colOffset);
      const endCol = Math.max(
        0,
        Math.ceil((scrollLeft + clientWidth) / cell) + colOffset,
      );

      requestVisibleWords(startRow, startCol, endRow, endCol);
    };

    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    };

    scrollElement.addEventListener("scroll", onScroll);

    // Initial / dependency-change refresh (debounced so rapid zoom or chunk
    // loads coalesce into a single request).
    clearTimeout(timer);
    timer = setTimeout(update, 250);

    return () => {
      clearTimeout(timer);
      scrollElement.removeEventListener("scroll", onScroll);
    };
  }, [zoom, loadedChunkBounds, chunkSize, chunks.size, requestVisibleWords]);

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

  // Debug: set of "row,col" keys for every word cell, used to paint them red.
  const debugWordCells = useMemo(() => {
    const set = new Set<string>();
    if (!DEBUG_WORDS) return set;
    for (const w of visibleWords) {
      w.coords?.forEach((pos) => set.add(getPositionKey(pos)));
    }
    return set;
  }, [visibleWords]);

  const sortedVisibleWords = [...visibleWords].sort((a, b) => {
    // Unfound first, then alphabetical
    if (a.founded !== b.founded) return a.founded ? 1 : -1;
    return a.word.localeCompare(b.word);
  });
  const foundCount = visibleWords.filter((w) => w.founded).length;

  const isConnected = connectionStatus === "Connected";
  const statusLabel =
    {
      Connected: "conectado",
      Connecting: "conectando…",
      Closing: "encerrando…",
      Disconnected: "desconectado",
      Uninstantiated: "iniciando…",
    }[connectionStatus] ?? connectionStatus.toLowerCase();

  return (
    <div className="flex-1 relative overflow-hidden bg-base">
      {/* Connection Status */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-surface0 bg-mantle px-3 py-1.5 shadow-sm">
        <span
          className={`inline-block size-2 rounded-full ${
            isConnected ? "bg-green" : "bg-yellow"
          }`}
        />
        <span className="font-mono text-xs text-subtext1">{statusLabel}</span>
        <span className="font-mono text-[10px] text-overlay1">
          chunks {chunks.size}
        </span>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={handleZoomOut}
          size="icon"
          variant="outline"
          className="bg-mantle shadow-sm"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleZoomIn}
          size="icon"
          variant="outline"
          className="bg-mantle shadow-sm"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Visible Words — floating panel on desktop, collapsible bottom sheet on mobile */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex max-h-[55vh] flex-col overflow-hidden rounded-lg border border-surface0 bg-mantle shadow-sm sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:max-h-[60vh] sm:w-52">
        <button
          type="button"
          onClick={() => setWordsOpen((o) => !o)}
          aria-expanded={wordsOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:cursor-default sm:py-2"
        >
          <span className="font-mono text-xs text-subtext1">nesta tela</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-overlay1">
              {foundCount}/{visibleWords.length}
            </span>
            <ChevronUp
              className={`h-4 w-4 text-overlay1 transition-transform sm:hidden ${
                wordsOpen ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
        <div
          className={`scrollbar-hide overflow-y-auto border-t border-surface0 px-3 py-2 ${
            wordsOpen ? "block" : "hidden"
          } sm:block`}
        >
          {sortedVisibleWords.length === 0 ? (
            <p className="font-mono text-xs text-overlay1">nenhuma palavra</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedVisibleWords.map((w) => (
                <li
                  key={w.word}
                  className={`font-mono text-sm ${
                    w.founded
                      ? "text-green line-through decoration-green/60"
                      : "text-subtext0"
                  }`}
                >
                  {w.word}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Coordinate Popover */}
      {hoveredCell && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-surface1 bg-crust px-2 py-1 font-mono text-xs text-subtext1 shadow-md"
          style={{
            left: `${hoveredCell.x + 10}px`,
            top: `${hoveredCell.y + 10}px`,
          }}
        >
          <span className="text-mauve">[</span>
          {hoveredCell.row}, {hoveredCell.col}
          <span className="text-mauve">]</span>
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
                const isDebugWord = DEBUG_WORDS && debugWordCells.has(posKey);

                let cellClass =
                  "flex items-center justify-center border border-surface0/60 transition-colors duration-150 absolute top-0 left-0 cursor-pointer";
                let letterClass = "select-none font-mono font-medium";

                if (isValidated) {
                  cellClass += " bg-green/20";
                  letterClass += " text-green";
                } else if (isSelected) {
                  cellClass += " bg-mauve/25";
                  letterClass += " text-mauve";
                } else if (isDebugWord) {
                  cellClass += " bg-red/20";
                  letterClass += " text-red";
                } else {
                  cellClass += " bg-base hover:bg-surface0";
                  letterClass += " text-subtext0";
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
                      className={letterClass}
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
