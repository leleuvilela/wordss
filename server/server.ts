import type { ServerWebSocket } from "bun";
import { InfiniteWordSearch } from "./game";
import type {
  Grid,
  Statistics,
  Position,
  ChunkRequest,
  RegionRequest,
  ValidateRequest,
  StatsRequest,
  ChunkResponse,
  RegionResponse,
  ValidateResponse,
  StatsResponse,
  ErrorResponse,
  WebSocketMessage,
  WebSocketResponse,
  WebSocketData,
  WordFoundResponse,
  FoundWordsListResponse,
} from "./types";

const GAME_CHANNEL = "game";

class WordSearchServer {
  private game: InfiniteWordSearch;
  private connectedClients: Set<ServerWebSocket<WebSocketData>> = new Set();

  constructor(chunkSize: number = 10, words?: string[]) {
    this.game = new InfiniteWordSearch(chunkSize, words);
  }

  handleConnection(ws: ServerWebSocket<WebSocketData>) {
    console.log("🔌 New client connected");

    // Send stats
    const stats = this.game.getStatistics();
    const welcomeMessage: StatsResponse = {
      type: "stats",
      data: stats,
    };
    ws.send(JSON.stringify(welcomeMessage));

    // Send list of already found words
    const foundWords = this.game.getFoundWords();
    const foundWordsMessage: FoundWordsListResponse = {
      type: "foundWordsList",
      foundWords: foundWords,
    };
    ws.send(JSON.stringify(foundWordsMessage));

    ws.subscribe(GAME_CHANNEL);
    this.connectedClients.add(ws);
  }

  handleDisconnection(ws: ServerWebSocket<WebSocketData>) {
    console.log("❌ Client disconnected");
    this.connectedClients.delete(ws);
    ws.unsubscribe(GAME_CHANNEL);
  }

  handleMessage(ws: ServerWebSocket<WebSocketData>, message: string) {
    try {
      const data: WebSocketMessage = JSON.parse(message);

      switch (data.type) {
        case "getChunk":
          this.handleChunkRequest(ws, data);
          break;
        case "getRegion":
          this.handleRegionRequest(ws, data);
          break;
        case "validate":
          this.handleValidateRequest(ws, data);
          break;
        case "getStats":
          this.handleStatsRequest(ws);
          break;
        case "getFoundWords":
          this.handleGetFoundWords(ws);
          break;
        default:
          this.sendError(ws, "Unknown message type");
      }
    } catch (error) {
      console.error("Error parsing message:", error);
      this.sendError(ws, "Invalid JSON message");
    }
  }

  private handleChunkRequest(
    ws: ServerWebSocket<WebSocketData>,
    request: ChunkRequest,
  ) {
    console.log(`📦 Chunk request: (${request.chunkRow}, ${request.chunkCol})`);

    // Generate/ensure chunk exists
    this.game.expandToPosition(request.chunkRow * 10, request.chunkCol * 10);

    // Get the chunk data
    const startRow = request.chunkRow * 10;
    const startCol = request.chunkCol * 10;
    const endRow = startRow + 9;
    const endCol = startCol + 9;

    const chunkData = this.game.getRegion(startRow, startCol, endRow, endCol);

    const response: ChunkResponse = {
      type: "chunk",
      chunkRow: request.chunkRow,
      chunkCol: request.chunkCol,
      data: chunkData,
      chunkSize: 10,
    };

    ws.send(JSON.stringify(response));
  }

  private handleRegionRequest(
    ws: ServerWebSocket<WebSocketData>,
    request: RegionRequest,
  ) {
    console.log(
      `🗺️ Region request: (${request.startRow},${request.startCol}) to (${request.endRow},${request.endCol})`,
    );

    const regionData = this.game.getRegion(
      request.startRow,
      request.startCol,
      request.endRow,
      request.endCol,
    );

    const response: RegionResponse = {
      type: "region",
      data: regionData,
      startRow: request.startRow,
      startCol: request.startCol,
      endRow: request.endRow,
      endCol: request.endCol,
    };

    ws.send(JSON.stringify(response));
  }

  private handleValidateRequest(
    ws: ServerWebSocket<WebSocketData>,
    request: ValidateRequest,
  ) {
    console.log(
      `✅ Validation request for ${request.coords.length} coordinates`,
    );

    const result = this.game.validateSelection(request.coords);

    const response: ValidateResponse = {
      type: "validation",
      result,
      coords: request.coords,
    };

    ws.send(JSON.stringify(response));

    // If a word was found, broadcast it to all players
    if (result) {
      console.log(`🎉 Word found: ${result}`);
      const wordFoundMessage: WordFoundResponse = {
        type: "wordFound",
        word: result,
        coords: request.coords,
      };
      ws.publish(GAME_CHANNEL, JSON.stringify(wordFoundMessage));
    }
  }

  private handleGetFoundWords(ws: ServerWebSocket<WebSocketData>) {
    console.log("📉 Fonded Words request");

    const foundWords = this.game.getFoundWords();
    const foundWordsMessage: FoundWordsListResponse = {
      type: "foundWordsList",
      foundWords: foundWords,
    };
    ws.send(JSON.stringify(foundWordsMessage));
  }

  private handleStatsRequest(ws: ServerWebSocket<WebSocketData>) {
    console.log("📊 Stats request");

    const stats = this.game.getStatistics();

    const response: StatsResponse = {
      type: "stats",
      data: stats,
    };

    ws.send(JSON.stringify(response));
  }

  private sendError(ws: ServerWebSocket<WebSocketData>, message: string) {
    const error: ErrorResponse = {
      type: "error",
      message,
    };
    ws.send(JSON.stringify(error));
  }

  getConnectedClients(): number {
    return this.connectedClients.size;
  }
}

// Create server instance
const server = new WordSearchServer(10);

// Create Bun server with WebSocket support
const bunServer = Bun.serve({
  port: 3001,
  fetch(req, server) {
    const cookies = new Bun.CookieMap(req.headers.get("cookie")!);

    server.upgrade(req, {
      // this object must conform to WebSocketData
      data: {
        createdAt: Date.now(),
        authToken: cookies.get("X-Token")!,
      },
    });

    return undefined;
  },
  websocket: {
    data: {} as WebSocketData,
    message(ws, message) {
      const messageStr =
        typeof message === "string" ? message : Buffer.from(message).toString();
      server.handleMessage(ws, messageStr);
    },
    open(ws) {
      server.handleConnection(ws);
    },
    close(ws) {
      server.handleDisconnection(ws);
    },
  },
});

console.log(`🚀 Word Search WebSocket server started!`);
console.log(`📡 Server running at: http://localhost:${bunServer.port}`);
console.log(`🔌 WebSocket endpoint: ws://localhost:${bunServer.port}`);
