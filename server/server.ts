import type { ServerWebSocket } from "bun";
import {
  InfiniteCacaPalavras,
  type Grid,
  type Statistics,
  type Position,
} from "./game";

interface ChunkRequest {
  type: "getChunk";
  chunkRow: number;
  chunkCol: number;
}

interface RegionRequest {
  type: "getRegion";
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface ValidateRequest {
  type: "validate";
  coords: Position[];
}

interface StatsRequest {
  type: "getStats";
}

interface ChunkResponse {
  type: "chunk";
  chunkRow: number;
  chunkCol: number;
  data: Grid;
  chunkSize: number;
}

interface RegionResponse {
  type: "region";
  data: Grid;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface ValidateResponse {
  type: "validation";
  result: string | null;
  coords: Position[];
}

interface StatsResponse {
  type: "stats";
  data: Statistics;
}

interface ErrorResponse {
  type: "error";
  message: string;
}

type WebSocketMessage =
  | ChunkRequest
  | RegionRequest
  | ValidateRequest
  | StatsRequest;
type WebSocketResponse =
  | ChunkResponse
  | RegionResponse
  | ValidateResponse
  | StatsResponse
  | ErrorResponse;

class CacaPalavrasServer {
  private game: InfiniteCacaPalavras;
  private connectedClients: Set<ServerWebSocket<WebSocketData>> = new Set();

  constructor(chunkSize: number = 10, words?: string[]) {
    this.game = new InfiniteCacaPalavras(chunkSize, words);
  }

  handleConnection(ws: ServerWebSocket<WebSocketData>) {
    console.log("🔌 New client connected");
    this.connectedClients.add(ws);

    // Send welcome message with initial stats
    const stats = this.game.getStatistics();
    const welcomeMessage: StatsResponse = {
      type: "stats",
      data: stats,
    };
    ws.send(JSON.stringify(welcomeMessage));
  }

  handleDisconnection(ws: ServerWebSocket<WebSocketData>) {
    console.log("❌ Client disconnected");
    this.connectedClients.delete(ws);
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

  broadcast(message: WebSocketResponse) {
    const messageStr = JSON.stringify(message);
    for (const client of this.connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }

  getConnectedClients(): number {
    return this.connectedClients.size;
  }
}

// Create server instance
const server = new CacaPalavrasServer(10);

type WebSocketData = {
  createdAt: number;
  authToken: string;
};

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

console.log(`🚀 Caça Palavras WebSocket server started!`);
console.log(`📡 Server running at: http://localhost:${bunServer.port}`);
console.log(`🔌 WebSocket endpoint: ws://localhost:${bunServer.port}`);
