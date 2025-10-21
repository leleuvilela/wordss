// ==========================================
// Types from game.ts
// ==========================================

export enum Direction {
  HORIZONTAL = "HORIZONTAL",
  VERTICAL = "VERTICAL",
  DIAGONAL_DOWN = "DIAGONAL_DOWN",
  DIAGONAL_UP = "DIAGONAL_UP",
  HORIZONTAL_REV = "HORIZONTAL_REV",
  VERTICAL_REV = "VERTICAL_REV",
  DIAGONAL_DOWN_REV = "DIAGONAL_DOWN_REV",
  DIAGONAL_UP_REV = "DIAGONAL_UP_REV",
}

export const DirectionVectors: Record<Direction, [number, number]> = {
  [Direction.HORIZONTAL]: [0, 1],
  [Direction.VERTICAL]: [1, 0],
  [Direction.DIAGONAL_DOWN]: [1, 1],
  [Direction.DIAGONAL_UP]: [-1, 1],
  [Direction.HORIZONTAL_REV]: [0, -1],
  [Direction.VERTICAL_REV]: [-1, 0],
  [Direction.DIAGONAL_DOWN_REV]: [-1, -1],
  [Direction.DIAGONAL_UP_REV]: [1, -1],
};

export type Position = [number, number];
export type ChunkCoords = [number, number];
export type Grid = string[][];

export interface WordPlacement {
  word: string;
  startRow: number;
  startCol: number;
  direction: Direction;
  chunkCoords: ChunkCoords;
  wordId: string;
  founded: boolean;
}

export interface Statistics {
  chunksGenerated: number;
  placedWords: number;
  totalCells: number;
  bounds: [number, number, number, number];
  areaSize: [number, number];
}

// ==========================================
// Types from server.ts
// ==========================================

export interface ChunkRequest {
  type: "getChunk";
  chunkRow: number;
  chunkCol: number;
}

export interface RegionRequest {
  type: "getRegion";
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ValidateRequest {
  type: "validate";
  coords: Position[];
}

export interface StatsRequest {
  type: "getStats";
}

export interface FoundWordsRequest {
  type: "getFoundWords";
}

export interface ChunkResponse {
  type: "chunk";
  chunkRow: number;
  chunkCol: number;
  data: Grid;
  chunkSize: number;
}

export interface RegionResponse {
  type: "region";
  data: Grid;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ValidateResponse {
  type: "validation";
  result: string | null;
  coords: Position[];
}

export interface StatsResponse {
  type: "stats";
  data: Statistics;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export interface WordFoundResponse {
  type: "wordFound";
  word: string;
  coords: Position[];
  foundBy?: string;
}

export interface FoundWordsListResponse {
  type: "foundWordsList";
  foundWords: Array<{
    word: string;
    coords: Position[];
  }>;
}

export type WebSocketMessage =
  | ChunkRequest
  | RegionRequest
  | ValidateRequest
  | FoundWordsRequest
  | StatsRequest;

export type WebSocketResponse =
  | ChunkResponse
  | RegionResponse
  | ValidateResponse
  | StatsResponse
  | ErrorResponse
  | WordFoundResponse
  | FoundWordsListResponse;

export type WebSocketData = {
  createdAt: number;
  authToken: string;
};
