import React, { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";

// Define types for socket events
interface ButtonEventData {
  message: string;
  timestamp: string;
  from: string;
}

interface ServerToClientEvents {
  "button-event": (data: ButtonEventData) => void;
}

type SocketType = Socket<ServerToClientEvents>;

const SocketPage: React.FC = () => {
  const [events, setEvents] = useState<ButtonEventData[]>([]);
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    // Connect to Socket.IO server
    const socket: SocketType = io("http://localhost:3001");

    socket.on("connect", () => {
      console.log("Connected to server");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnected(false);
    });

    // Listen for button events from React Native
    socket.on("button-event", (data: ButtonEventData) => {
      console.log("Received button event:", data);
      setEvents((prevEvents) => [data, ...prevEvents]);
    });

    // Cleanup on component unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const clearEvents = (): void => {
    setEvents([]);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Web App - Real-time Events</h1>

      <div style={{ marginBottom: "20px" }}>
        <span
          style={{
            color: connected ? "green" : "red",
            fontWeight: "bold",
          }}
        >
          {connected ? "🟢 Connected" : "🔴 Disconnected"}
        </span>
      </div>

      <button
        onClick={clearEvents}
        style={{
          padding: "10px 20px",
          backgroundColor: "#f44336",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        Clear Events
      </button>

      <div>
        <h2>Events from React Native ({events.length})</h2>
        {events.length === 0 ? (
          <p style={{ color: "#666" }}>
            Waiting for button clicks from React Native app...
          </p>
        ) : (
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {events.map((event: ButtonEventData, index: number) => (
              <div
                key={index}
                style={{
                  backgroundColor: "#e8f5e8",
                  border: "1px solid #4CAF50",
                  borderRadius: "5px",
                  padding: "15px",
                  marginBottom: "10px",
                  animation: index === 0 ? "fadeIn 0.5s" : "none",
                }}
              >
                <div style={{ fontWeight: "bold", color: "#2E7D32" }}>
                  {event.message}
                </div>
                <div
                  style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}
                >
                  From: {event.from} | Time:{" "}
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default SocketPage;
