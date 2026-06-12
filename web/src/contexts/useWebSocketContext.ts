import type { WebSocketMessage, WebSocketResponse } from "@/types";
import { createContext, useContext } from "react";
import type { ReadyState } from "react-use-websocket";

export interface WebSocketContextType {
  sendMessage: (message: WebSocketMessage) => void;
  lastMessage: WebSocketResponse | null;
  readyState: ReadyState;
  connectionStatus: string;
}

export const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined,
);

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider",
    );
  }
  return context;
}
