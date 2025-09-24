import { supabase } from "../integration/supabase/client";
import { extractFaceDescriptor, findBestMatch } from "../utils/faceRecognition";

export interface Class {
  id: string;
  class_name: string;
  teacher_name: string;
}

export interface Student {
  id: string;
  student_id: string;
  name: string;
}

export type DetectionResult =
  | { status: "recognized"; studentName: string; confidence: number }
  | { status: "already_marked"; studentName: string }
  | { status: "no_face" }
  | { status: "not_recognized" }
  | { status: "error" };

export interface AttendanceServiceState {
  isProcessing: boolean;
  isAttendanceMode: boolean;
  selectedClass: string;
  classes: Class[];
  students: Student[];
}

export class AttendanceService {
  private state: AttendanceServiceState = {
    isProcessing: false,
    isAttendanceMode: false,
    selectedClass: "",
    classes: [],
    students: [],
  };

  private listeners: Array<(state: AttendanceServiceState) => void> = [];

  constructor() {
    this.loadClasses();
  }

  // State management
  subscribe(listener: (state: AttendanceServiceState) => void) {
    this.listeners.push(listener);
    listener(this.state); // Initial call
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private updateState(updates: Partial<AttendanceServiceState>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  // Data loading
  async loadClasses(): Promise<void> {
    try {
      const { data, error } = await supabase.from("classes").select("*");
      if (error) {
        console.error("Error loading classes:", error);
        return;
      }
      if (data) {
        this.updateState({ classes: data });
      }
    } catch (error) {
      console.error("Error loading classes:", error);
    }
  }

  async loadStudents(): Promise<void> {
    try {
      const { data, error } = await supabase.from("students").select("*");
      if (error) {
        console.error("Error loading students:", error);
        return;
      }
      if (data) {
        this.updateState({ students: data });
      }
    } catch (error) {
      console.error("Error loading students:", error);
    }
  }

  async refreshData(): Promise<void> {
    await Promise.all([this.loadClasses(), this.loadStudents()]);
  }

  // Attendance flow
  setSelectedClass(classId: string): void {
    this.updateState({ selectedClass: classId });
  }

  async startAttendance(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.selectedClass) {
      return {
        success: false,
        error: "Please select a class before taking attendance.",
      };
    }

    try {
      await this.refreshData();
      this.updateState({ isAttendanceMode: true });
      return { success: true };
    } catch (error) {
      console.error("Error starting attendance:", error);
      return { success: false, error: "Failed to start attendance session." };
    }
  }

  stopAttendance(): void {
    this.updateState({ isAttendanceMode: false });
  }

  // Face recognition
  async handleFaceDetection(imageData: string): Promise<DetectionResult> {
    this.updateState({ isProcessing: true });

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

            // Fetch all stored face embeddings
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
                .eq("class_id", this.state.selectedClass)
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
              const confidence = Math.max(0, 1 - bestMatch.distance);
              const { error } = await supabase.from("attendance").insert({
                student_id: bestMatch.id,
                class_id: this.state.selectedClass,
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
      this.updateState({ isProcessing: false });
    }
  }

  // Getters
  getState(): AttendanceServiceState {
    return this.state;
  }

  isProcessing(): boolean {
    return this.state.isProcessing;
  }

  isInAttendanceMode(): boolean {
    return this.state.isAttendanceMode;
  }

  getSelectedClass(): string {
    return this.state.selectedClass;
  }

  getClasses(): Class[] {
    return this.state.classes;
  }

  getStudents(): Student[] {
    return this.state.students;
  }
}

// Singleton instance
export const attendanceService = new AttendanceService();
