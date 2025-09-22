import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";

// Define types for socket events
interface ButtonClickData {
  message?: string;
  clickNumber: number;
  timestamp: string;
}

interface ButtonEventData {
  message: string;
  timestamp: string;
  from: string;
}

// Define socket event types
interface ServerToClientEvents {
  "button-event": (data: ButtonEventData) => void;
}

interface ClientToServerEvents {
  "button-clicked": (data: ButtonClickData) => void;
}

const app = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  server,
  {
    cors: {
      origin: "*", // In production, specify your domains
      methods: ["GET", "POST"],
    },
  }
);

app.use(cors());

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Listen for button click from React Native
  socket.on("button-clicked", (data: ButtonClickData) => {
    console.log("Button clicked:", data);

    // Broadcast to all connected clients (including web app)
    io.emit("button-event", {
      message: data.message || "Button was clicked!",
      timestamp: new Date().toISOString(),
      from: "React Native App",
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT: number = parseInt(process.env.PORT || "3001");
server.listen(PORT, () => {
  console.log(`Socket.IO server running on http://localhost:${PORT}`);
});
