"use client";

import { startTransition, useEffect, useState } from "react";

import type {
  AirQualityReading,
  RealtimeAlert,
  RealtimeAirPayload,
  RealtimeFireEvent,
  RealtimeFirePayload,
} from "@/lib/api";
import { toWebSocketUrl } from "@/lib/api";

interface UseRealtimeFeedResult {
  airReadings: AirQualityReading[];
  fireEvents: RealtimeFireEvent[];
  alerts: RealtimeAlert[];
  isConnected: boolean;
  lastUpdate: string | null;
}

export function useRealtimeFeed(): UseRealtimeFeedResult {
  const [airReadings, setAirReadings] = useState<AirQualityReading[]>([]);
  const [fireEvents, setFireEvents] = useState<RealtimeFireEvent[]>([]);
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const handleMessage = (
      payload: RealtimeAirPayload | RealtimeFirePayload | RealtimeAlert,
    ) => {
      if (payload.type === "air_quality") {
        startTransition(() => {
          setAirReadings(payload.readings);
          setLastUpdate(payload.timestamp);
        });
        return;
      }

      if (payload.type === "fire") {
        startTransition(() => {
          setFireEvents(payload.events);
          setLastUpdate(payload.timestamp);
        });
        return;
      }

      startTransition(() => {
        setAlerts((current) => [payload, ...current].slice(0, 12));
        setLastUpdate(payload.timestamp);
      });
    };

    const connect = () => {
      socket = new WebSocket(toWebSocketUrl("/ws/live-feed"));
      socket.onopen = () => {
        setIsConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as
            | RealtimeAirPayload
            | RealtimeFirePayload
            | RealtimeAlert;
          handleMessage(payload);
        } catch {
          // Ignore malformed websocket payloads and keep the stream alive.
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        setIsConnected(false);
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
        }
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 5_000);
      };
    };

    connect();
    return () => {
      socket?.close();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  return { airReadings, fireEvents, alerts, isConnected, lastUpdate };
}
