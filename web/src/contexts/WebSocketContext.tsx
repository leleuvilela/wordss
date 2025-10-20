import type { WebSocketMessage, WebSocketResponse } from "@/types";
import { createContext, useContext, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

interface WebSocketContextType {
  sendMessage: (message: WebSocketMessage) => void;
  lastMessage: WebSocketResponse | null;
  readyState: ReadyState;
  connectionStatus: string;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined,
);

interface WebSocketProviderProps {
  children: ReactNode;
  url: string;
}

export function WebSocketProvider({ children, url }: WebSocketProviderProps) {
  const { sendJsonMessage, lastJsonMessage, readyState } =
    useWebSocket<WebSocketResponse>(url, {
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
    });

  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Connected",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Disconnected",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  return (
    <WebSocketContext.Provider
      value={{
        sendMessage: sendJsonMessage,
        lastMessage: lastJsonMessage,
        readyState,
        connectionStatus,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider",
    );
  }
  return context;
}
