import type { ServerWebSocket } from "bun";
import { InfiniteWordSearch } from "./game";
import type {
  ChunkRequest,
  RegionRequest,
  ValidateRequest,
  ChunkResponse,
  RegionResponse,
  ValidateResponse,
  StatsResponse,
  ErrorResponse,
  WebSocketMessage,
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

    const chunkSize = this.game.getChunkSize();
    const startRow = request.chunkRow * chunkSize;
    const startCol = request.chunkCol * chunkSize;
    const endRow = startRow + chunkSize - 1;
    const endCol = startCol + chunkSize - 1;

    const chunkData = this.game.getRegion(startRow, startCol, endRow, endCol);

    const response: ChunkResponse = {
      type: "chunk",
      chunkRow: request.chunkRow,
      chunkCol: request.chunkCol,
      data: chunkData,
      chunkSize,
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
    console.log("📋 Found words request");

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
  port: Number(process.env.PORT ?? 3000),
  fetch(req, server) {
    const cookies = new Bun.CookieMap(req.headers.get("cookie") ?? "");

    const upgraded = server.upgrade(req, {
      // this object must conform to WebSocketData
      data: {
        createdAt: Date.now(),
        authToken: cookies.get("X-Token") ?? "",
      },
    });

    if (upgraded) return undefined;

    // Plain HTTP request (e.g. healthcheck)
    return new Response("Word Search WebSocket server", { status: 200 });
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
