import { useEffect, useState } from "react";
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
import { supabase } from "../integration/supabase/client";
import { useToast } from "../hooks/use-toast";
import { extractFaceDescriptor, findBestMatch } from "../utils/faceRecognition";
import { UserCheck, Users, Calendar } from "lucide-react";

interface Class {
  id: string;
  class_name: string;
  teacher_name: string;
}

interface Student {
  id: string;
  student_id: string;
  name: string;
}

export const AttendanceApp = () => {
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [isAttendanceMode, setIsAttendanceMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [_students, setStudents] = useState<Student[]>([]);
  const { toast } = useToast();

  // Load classes on mount so the Select shows real class IDs (UUIDs)
  useEffect(() => {
    const loadClasses = async () => {
      const { data, error } = await supabase.from("classes").select("*");
      if (error) {
        console.error("Error loading classes:", error);
        return;
      }
      if (data) setClasses(data);
    };
    loadClasses();
  }, []);

  // Return structured result so UI can show accurate feedback
  type DetectionResult =
    | { status: "recognized"; studentName: string; confidence: number }
    | { status: "already_marked"; studentName: string }
    | { status: "no_face" }
    | { status: "not_recognized" }
    | { status: "error" };

  // Real face recognition function using ML
  const handleFaceDetection = async (
    imageData: string
  ): Promise<DetectionResult> => {
    setIsProcessing(true);

    try {
      // Convert base64 image to HTMLImageElement
      const img = new Image();

      return new Promise<DetectionResult>((resolve) => {
        img.onload = async () => {
          try {
            // Extract face descriptor from captured image
            const capturedDescriptor = await extractFaceDescriptor(img);

            if (!capturedDescriptor) {
              resolve({ status: "no_face" });
              return;
            }

            // Fetch all stored face embeddings (typed-safe, no nested join)
            const { data: embeddings, error: embeddingsError } = await supabase
              .from("face_embeddings")
              .select("id, embedding, student_id");

            if (embeddingsError || !embeddings) {
              console.error("Error fetching embeddings:", embeddingsError);
              resolve({ status: "error" });
              return;
            }

            // Fetch matching students for the embeddings
            const studentIds = Array.from(
              new Set(embeddings.map((e) => e.student_id))
            );

            const { data: studentsForEmbeddings, error: studentsErr } =
              await supabase
                .from("students")
                .select("id, name, student_id")
                .in("id", studentIds);

            if (studentsErr || !studentsForEmbeddings) {
              console.error("Error fetching students:", studentsErr);
              resolve({ status: "error" });
              return;
            }

            const studentById = new Map(
              studentsForEmbeddings.map((s) => [s.id, s])
            );

            // Convert stored embeddings to proper format
            const storedDescriptors = embeddings
              .filter((e) => e.embedding && studentById.has(e.student_id))
              .map((e) => {
                const student = studentById.get(e.student_id)!;
                const vector = Array.isArray(e.embedding)
                  ? (e.embedding as number[])
                  : JSON.parse(e.embedding as unknown as string);
                return {
                  id: student.id,
                  studentName: student.name,
                  descriptor: new Float32Array(vector),
                };
              });

            if (storedDescriptors.length === 0) {
              resolve({ status: "not_recognized" });
              return;
            }

            // Find the best match
            const bestMatch = findBestMatch(
              capturedDescriptor,
              storedDescriptors
            );

            if (bestMatch) {
              // Check if student already marked attendance today
              const today = new Date().toISOString().split("T")[0];
              const { data: existingAttendance } = await supabase
                .from("attendance")
                .select("id")
                .eq("student_id", bestMatch.id)
                .eq("class_id", selectedClass)
                .eq("attendance_date", today)
                .single();

              if (existingAttendance) {
                resolve({
                  status: "already_marked",
                  studentName: bestMatch.studentName,
                });
                return;
              }

              // Mark attendance
              const confidence = Math.max(0, 1 - bestMatch.distance); // Convert distance to confidence
              const { error } = await supabase.from("attendance").insert({
                student_id: bestMatch.id,
                class_id: selectedClass,
                confidence_score: confidence,
                attendance_date: today,
              });

              if (error) {
                console.error("Error marking attendance:", error);
                resolve({ status: "error" });
                return;
              }

              resolve({
                status: "recognized",
                studentName: bestMatch.studentName,
                confidence: confidence,
              });
            } else {
              resolve({ status: "not_recognized" });
            }
          } catch (error) {
            console.error("Face recognition error:", error);
            resolve({ status: "error" });
          }
        };

        img.onerror = () => {
          console.error("Error loading image for face recognition");
          resolve({ status: "error" });
        };

        img.src = imageData;
      });
    } catch (error) {
      console.error("Face detection error:", error);
      return { status: "error" };
    } finally {
      setIsProcessing(false);
    }
  };

  const startAttendance = async () => {
    if (!selectedClass) {
      toast({
        title: "Please select a class",
        description: "You must select a class before taking attendance.",
        variant: "destructive",
      });
      return;
    }

    // Fetch classes and students
    const [classesResponse, studentsResponse] = await Promise.all([
      supabase.from("classes").select("*"),
      supabase.from("students").select("*"),
    ]);

    if (classesResponse.data) setClasses(classesResponse.data);
    if (studentsResponse.data) setStudents(studentsResponse.data);

    setIsAttendanceMode(true);
  };

  const stopAttendance = () => {
    setIsAttendanceMode(false);
  };

  const refreshData = async () => {
    const [classesResponse, studentsResponse] = await Promise.all([
      supabase.from("classes").select("*"),
      supabase.from("students").select("*"),
    ]);

    if (classesResponse.data) setClasses(classesResponse.data);
    if (studentsResponse.data) setStudents(studentsResponse.data);
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
                  <Select
                    value={selectedClass}
                    onValueChange={setSelectedClass}
                  >
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
                    onClick={startAttendance}
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
              <StudentManager onStudentAdded={refreshData} />
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
                onFaceDetected={handleFaceDetection}
                isProcessing={isProcessing}
              />

              <div className="mt-6 space-y-2">
                <Button
                  onClick={stopAttendance}
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
                <li>Add students with photos in Manage Students tab</li>
                <li>Select a class and start attendance</li>
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
