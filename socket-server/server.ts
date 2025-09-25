import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";

// ======================
// Define socket payload types
// ======================
interface StartSessionData {
  trigger: "start_session" | "end_session";
  session_id: string;
  teacher_id?: string;
  timestamp: string;
}

interface SessionEventData {
  message: string;
  session_id: string;
  teacher_id?: string;
  timestamp: string;
}

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

// Server -> Client events
interface ServerToClientEvents {
  "session-started": (data: SessionEventData) => void;
  "session-ended": (data: SessionEventData) => void;
  "button-event": (data: ButtonEventData) => void;
}

// Client -> Server events
interface ClientToServerEvents {
  "start-session": (data: StartSessionData) => void;
  "end-session": (data: StartSessionData) => void;
  "button-clicked": (data: ButtonClickData) => void;
}

// ======================
// Setup Express + Socket.IO
// ======================
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  server,
  {
    cors: {
      origin: "*", // TODO: Lock down in production
      methods: ["GET", "POST"],
    },
  }
);

// ======================
// Socket.IO Events
// ======================
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle start-session trigger
  socket.on("start-session", async (data: StartSessionData) => {
    console.log("Received start-session:", data);

    // ✅ Basic validation
    if (!data.session_id || data.trigger !== "start_session") {
      console.warn("Invalid start-session payload:", data);
      return;
    }

    // 🟢 TODO: Fetch enrolled students + create attendance rows in DB
    console.log("Fetching enrolled students & creating attendance records...");

    // Broadcast to all connected clients
    const event: SessionEventData = {
      message: "Session started successfully",
      session_id: data.session_id,
      teacher_id: data.teacher_id,
      timestamp: new Date().toISOString(),
    };

    io.emit("session-started", event);
    console.log("Broadcasted session-started:", event);
  });

  // Handle end-session trigger
  socket.on("end-session", (data: StartSessionData) => {
    console.log("Received end-session:", data);

    if (!data.session_id || data.trigger !== "end_session") {
      console.warn("Invalid end-session payload:", data);
      return;
    }

    const event: SessionEventData = {
      message: "Session ended successfully",
      session_id: data.session_id,
      teacher_id: data.teacher_id,
      timestamp: new Date().toISOString(),
    };

    io.emit("session-ended", event);
    console.log("Broadcasted session-ended:", event);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ======================
// Start server
// ======================
const PORT: number = parseInt(process.env.PORT || "3001");
server.listen(PORT, () => {
  console.log(`Socket.IO server running on http://localhost:${PORT}`);
});
