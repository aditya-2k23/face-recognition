import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { CameraView } from "./CameraView";
import { UserCheck, Users, Calendar } from "lucide-react";
import { io, Socket } from "socket.io-client";
import type {
  SessionInfo,
  DetectionResult,
} from "../services/attendanceService";
import { useEffect, useState } from "react";
import { supabase } from "../integration/supabase/client";

interface AttendanceUIProps {
  // State
  isAttendanceMode: boolean;
  isProcessing: boolean;
  selectedSession: string;
  sessions: SessionInfo[];

  // Actions
  onSessionSelect: (sessionId: string) => void;
  onStartAttendance: () => void;
  onStopAttendance: () => void;
  onFaceDetected: (imageData: string) => Promise<DetectionResult>;
}

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

export const AttendanceUI = ({
  isAttendanceMode,
  isProcessing,
  selectedSession,
  sessions,
  onSessionSelect,
  onStartAttendance,
  onStopAttendance,
  onFaceDetected,
}: AttendanceUIProps) => {
  const [start, setStart] = useState<boolean>(false);
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
    socket.on("button-event", () => {
      console.log("Start student attendance");
      setStart(true);
    });

    // Cleanup on component unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    // Probe a few course sessions to verify connectivity / existence
    const { data, error } = await supabase
      .from("course_sessions")
      .select("id, session_date, start_time, end_time, course_id, teacher_id")
      .limit(5);
    if (error) {
      console.error("Error fetching course sessions:", error);
    } else {
      console.log("Fetched course sessions (sample):", data);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <UserCheck className="h-6 w-6 text-primary" />
              Face Recognition Attendance
            </CardTitle>
            <CardDescription>
              Simple and efficient student attendance tracking
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Status:</strong>{" "}
                <span className="text-muted-foreground">
                  {connected ? "🟢 Connected" : "🔴 Disconnected"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {!isAttendanceMode ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Select Session
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedSession} onValueChange={onSessionSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No sessions found
                    </div>
                  ) : (
                    sessions.map((s) => {
                      const date = new Date(
                        s.session_date
                      ).toLocaleDateString();
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.course_title}{" "}
                          {s.course_code ? `(${s.course_code})` : ""} -{" "}
                          {s.teacher_name || "TBD"} - {date}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={onStartAttendance}
                className="w-full"
                size="lg"
                disabled={!selectedSession}
              >
                <Users className="mr-2 h-4 w-4" />
                Start Taking Attendance
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Camera Interface */
          <Card>
            <CardHeader>
              <CardTitle>Taking Attendance</CardTitle>
              <CardDescription>
                Point camera at student's face to mark attendance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CameraView
                onFaceDetected={onFaceDetected}
                isProcessing={isProcessing}
                start={start}
              />

              <div className="mt-6 space-y-2">
                <Button
                  onClick={onStopAttendance}
                  variant="outline"
                  className="w-full"
                >
                  Finish Attendance
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Instructions:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Sessions are pre-configured in admin system</li>
                <li>Select a session and start attendance</li>
                <li>Position student's face in the frame</li>
                <li>Tap "Detect Face" to mark attendance</li>
                <li>Real ML compares faces for accurate recognition</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
