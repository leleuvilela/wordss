import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";

const INITIAL_SIZE = 50; // Initial 50x50 grid
const CELL_SIZE = 60; // pixels
const EXPANSION_THRESHOLD = 10; // Expand when within 10 cells of edge
const EXPANSION_SIZE = 25; // Add 25 cells when expanding

// Generate random letters for the board
function generateBoard(size: number): string[][] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const board: string[][] = [];

  for (let i = 0; i < size; i++) {
    const row: string[] = [];
    for (let j = 0; j < size; j++) {
      row.push(letters[Math.floor(Math.random() * letters.length)]);
    }
    board.push(row);
  }

  return board;
}

// Generate random letters for new cells
function generateCells(count: number): string[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cells: string[] = [];
  for (let i = 0; i < count; i++) {
    cells.push(letters[Math.floor(Math.random() * letters.length)]);
  }
  return cells;
}

export function GameBoard() {
  const [zoom, setZoom] = useState(1);
  const [board, setBoard] = useState(() => generateBoard(INITIAL_SIZE));
  const parentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const isExpandingRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef<{ x: number; y: number } | null>(null);

  const rowCount = board.length;
  const colCount = board[0]?.length || 0;

  // Function to generate more board (will be replaced with websocket data in the future)
  const generateMoreBoard = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (isExpandingRef.current) return;
    isExpandingRef.current = true;

    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    // Store current scroll position
    const currentScrollLeft = scrollElement.scrollLeft;
    const currentScrollTop = scrollElement.scrollTop;

    setBoard((prevBoard) => {
      const newBoard = [...prevBoard.map(row => [...row])];

      if (direction === 'right') {
        // Add columns to the right
        for (let i = 0; i < newBoard.length; i++) {
          const newCells = generateCells(EXPANSION_SIZE);
          newBoard[i].push(...newCells);
        }
        console.log(`Expanded board to the right. New size: ${newBoard.length}x${newBoard[0].length}`);
      } else if (direction === 'left') {
        // Add columns to the left
        for (let i = 0; i < newBoard.length; i++) {
          const newCells = generateCells(EXPANSION_SIZE);
          newBoard[i].unshift(...newCells);
        }
        // Queue scroll adjustment
        const scrollOffset = EXPANSION_SIZE * CELL_SIZE * zoom;
        pendingScrollAdjustmentRef.current = {
          x: currentScrollLeft + scrollOffset,
          y: currentScrollTop,
        };
        console.log(`Expanded board to the left. New size: ${newBoard.length}x${newBoard[0].length}`);
      } else if (direction === 'down') {
        // Add rows to the bottom
        for (let i = 0; i < EXPANSION_SIZE; i++) {
          const newRow = generateCells(newBoard[0].length);
          newBoard.push(newRow);
        }
        console.log(`Expanded board to the bottom. New size: ${newBoard.length}x${newBoard[0].length}`);
      } else if (direction === 'up') {
        // Add rows to the top
        const rowsToAdd: string[][] = [];
        for (let i = 0; i < EXPANSION_SIZE; i++) {
          const newRow = generateCells(newBoard[0].length);
          rowsToAdd.push(newRow);
        }
        newBoard.unshift(...rowsToAdd);
        // Queue scroll adjustment
        const scrollOffset = EXPANSION_SIZE * CELL_SIZE * zoom;
        pendingScrollAdjustmentRef.current = {
          x: currentScrollLeft,
          y: currentScrollTop + scrollOffset,
        };
        console.log(`Expanded board to the top. New size: ${newBoard.length}x${newBoard[0].length}`);
      }

      setTimeout(() => {
        isExpandingRef.current = false;
      }, 500);

      return newBoard;
    });
  }, [zoom]);

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

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.4));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!parentRef.current) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX + parentRef.current.scrollLeft,
      y: e.clientY + parentRef.current.scrollTop,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !parentRef.current) return;

    const dx = dragStart.x - e.clientX;
    const dy = dragStart.y - e.clientY;

    parentRef.current.scrollLeft = dx;
    parentRef.current.scrollTop = dy;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Apply pending scroll adjustments after virtualizer recalculates
  useLayoutEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement || !pendingScrollAdjustmentRef.current) return;

    // Force virtualizers to measure first
    rowVirtualizer.measure();
    columnVirtualizer.measure();

    // Apply scroll adjustment in the next frame to ensure virtualizer has updated
    requestAnimationFrame(() => {
      if (pendingScrollAdjustmentRef.current) {
        const { x, y } = pendingScrollAdjustmentRef.current;
        const oldScrollLeft = scrollElement.scrollLeft;
        const oldScrollTop = scrollElement.scrollTop;

        scrollElement.scrollLeft = x;
        scrollElement.scrollTop = y;

        // If user is dragging, update dragStart to account for the scroll adjustment
        if (isDragging) {
          const deltaX = x - oldScrollLeft;
          const deltaY = y - oldScrollTop;
          setDragStart(prev => ({
            x: prev.x + deltaX,
            y: prev.y + deltaY,
          }));
        }

        pendingScrollAdjustmentRef.current = null;
      }
    });
  }, [rowCount, colCount, rowVirtualizer, columnVirtualizer, isDragging]);

  // Re-measure when zoom changes
  useEffect(() => {
    rowVirtualizer.measure();
    columnVirtualizer.measure();
  }, [zoom, rowVirtualizer, columnVirtualizer]);

  // Center board on initial load
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const centerBoard = () => {
      const { scrollWidth, scrollHeight, clientWidth, clientHeight } = scrollElement;
      scrollElement.scrollLeft = (scrollWidth - clientWidth) / 2;
      scrollElement.scrollTop = (scrollHeight - clientHeight) / 2;
    };

    // Center after initial render
    const timer = setTimeout(centerBoard, 100);
    return () => clearTimeout(timer);
  }, []);

  // Monitor scroll position and expand board when near edges
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = scrollElement;

      const threshold = EXPANSION_THRESHOLD * CELL_SIZE * zoom;

      // Check if near right edge
      if (scrollLeft + clientWidth >= scrollWidth - threshold) {
        generateMoreBoard('right');
      }

      // Check if near left edge
      if (scrollLeft <= threshold) {
        generateMoreBoard('left');
      }

      // Check if near bottom edge
      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        generateMoreBoard('down');
      }

      // Check if near top edge
      if (scrollTop <= threshold) {
        generateMoreBoard('up');
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [generateMoreBoard, zoom]);

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-50">
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
                const letter = board[virtualRow.index][virtualColumn.index];
                return (
                  <div
                    key={virtualColumn.key}
                    className="flex items-center justify-center border border-gray-300 bg-white hover:bg-blue-50 transition-colors absolute top-0 left-0"
                    style={{
                      width: `${virtualColumn.size}px`,
                      height: `${virtualRow.size}px`,
                      transform: `translateX(${virtualColumn.start}px)`,
                    }}
                  >
                    <span
                      className="text-gray-700 select-none"
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
