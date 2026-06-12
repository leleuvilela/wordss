import type { WebSocketResponse } from "@/types";
import { type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { WebSocketContext } from "./useWebSocketContext";

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
