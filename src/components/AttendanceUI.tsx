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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { CameraView } from "./CameraView";
import { StudentManager } from "./StudentManager";
import { UserCheck, Users, Calendar } from "lucide-react";
import { io, Socket } from "socket.io-client";
import type { Class, DetectionResult } from "../services/attendanceService";
import { useEffect, useState } from "react";

interface AttendanceUIProps {
  // State
  isAttendanceMode: boolean;
  isProcessing: boolean;
  selectedClass: string;
  classes: Class[];

  // Actions
  onClassSelect: (classId: string) => void;
  onStartAttendance: () => void;
  onStopAttendance: () => void;
  onFaceDetected: (imageData: string) => Promise<DetectionResult>;
  onRefreshData: () => void;
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
  selectedClass,
  classes,
  onClassSelect,
  onStartAttendance,
  onStopAttendance,
  onFaceDetected,
  onRefreshData,
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
          <Tabs defaultValue="attendance" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="attendance">Take Attendance</TabsTrigger>
              <TabsTrigger value="manage">Manage Students</TabsTrigger>
            </TabsList>

            <TabsContent value="attendance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Select Class
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select value={selectedClass} onValueChange={onClassSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No classes found
                        </div>
                      ) : (
                        classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.class_name} - {c.teacher_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={onStartAttendance}
                    className="w-full"
                    size="lg"
                    disabled={!selectedClass}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Start Taking Attendance
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manage" className="space-y-4">
              <StudentManager onStudentAdded={onRefreshData} />
            </TabsContent>
          </Tabs>
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
      </div>
    </div>
  );
};
