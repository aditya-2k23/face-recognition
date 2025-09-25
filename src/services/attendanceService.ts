import { supabase } from "../integration/supabase/client";
import { extractFaceDescriptor, findBestMatch } from "../utils/faceRecognition";

// New schema interfaces
export interface SessionInfo {
  id: string; // course_session id
  course_title: string;
  course_code: string | null;
  teacher_name: string | null;
  session_date: string; // YYYY-MM-DD
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
}

// Raw shape returned by loadSessions() (flat fields only to avoid join type issues)
interface RawSessionRow {
  id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  course_id?: string; // available if selected
  teacher_id?: string | null; // available if selected
}

export interface Student {
  id: string;
  full_name: string;
  email?: string | null;
  enrollment_year?: number | null;
  department?: string | null;
  photo_url?: string | null;
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
  selectedSession: string; // course_session id
  sessions: SessionInfo[];
}

export class AttendanceService {
  private state: AttendanceServiceState = {
    isProcessing: false,
    isAttendanceMode: false,
    selectedSession: "",
    sessions: [],
  };

  private listeners: Array<(state: AttendanceServiceState) => void> = [];

  constructor() {
    this.loadSessions();
  }

  subscribe(listener: (state: AttendanceServiceState) => void) {
    this.listeners.push(listener);
    listener(this.state);
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

  async loadSessions(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("course_sessions")
        .select(
          "id, session_date, start_time, end_time, location, course_id, teacher_id"
        )
        .order("session_date", { ascending: false });
      if (error) {
        console.error("Error loading sessions:", error);
        return;
      }
      if (data) {
        const sessions: SessionInfo[] = (
          data as unknown as RawSessionRow[]
        ).map((row) => ({
          id: row.id,
          // Placeholder labels until course / teacher details are fetched elsewhere.
          course_title: row.course_id
            ? `Course ${row.course_id.slice(0, 6)}`
            : "Course",
          course_code: null,
          teacher_name: row.teacher_id
            ? `Teacher ${row.teacher_id.slice(0, 6)}`
            : null,
          session_date: row.session_date,
          start_time: row.start_time,
          end_time: row.end_time,
          location: row.location,
        }));
        this.updateState({ sessions });
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
    }
  }

  async refreshData(): Promise<void> {
    await this.loadSessions();
  }

  setSelectedSession(sessionId: string): void {
    this.updateState({ selectedSession: sessionId });
  }

  async startAttendance(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.selectedSession) {
      return {
        success: false,
        error: "Please select a session before taking attendance.",
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

  async handleFaceDetection(imageData: string): Promise<DetectionResult> {
    this.updateState({ isProcessing: true });
    try {
      const img = new Image();
      return new Promise<DetectionResult>((resolve) => {
        img.onload = async () => {
          try {
            const capturedDescriptor = await extractFaceDescriptor(img);
            if (!capturedDescriptor) {
              resolve({ status: "no_face" });
              return;
            }
            const { data: embeddings, error: embeddingsError } = await supabase
              .from("face_embeddings")
              .select("id, embedding, student_id");
            if (embeddingsError || !embeddings) {
              console.error("Error fetching embeddings:", embeddingsError);
              resolve({ status: "error" });
              return;
            }
            const studentIds = Array.from(
              new Set(embeddings.map((e) => e.student_id))
            );
            const { data: studentsForEmbeddings, error: studentsErr } =
              await supabase
                .from("students")
                .select("id, full_name")
                .in("id", studentIds);
            if (studentsErr || !studentsForEmbeddings) {
              console.error("Error fetching students:", studentsErr);
              resolve({ status: "error" });
              return;
            }
            const studentById = new Map(
              studentsForEmbeddings.map((s) => [s.id, s])
            );
            const storedDescriptors = embeddings
              .filter((e) => e.embedding && studentById.has(e.student_id))
              .map((e) => {
                const student = studentById.get(e.student_id)!;
                const vector = Array.isArray(e.embedding)
                  ? (e.embedding as number[])
                  : (() => {
                      try {
                        return JSON.parse(e.embedding as unknown as string);
                      } catch {
                        return [] as number[];
                      }
                    })();
                return {
                  id: student.id,
                  studentName: student.full_name,
                  descriptor: new Float32Array(vector),
                };
              });
            if (storedDescriptors.length === 0) {
              resolve({ status: "not_recognized" });
              return;
            }
            const bestMatch = findBestMatch(
              capturedDescriptor,
              storedDescriptors
            );
            if (bestMatch) {
              const { data: existingAttendance } = await supabase
                .from("attendance")
                .select("id")
                .eq("student_id", bestMatch.id)
                .eq("session_id", this.state.selectedSession)
                .single();
              if (existingAttendance) {
                resolve({
                  status: "already_marked",
                  studentName: bestMatch.studentName,
                });
                return;
              }
              const confidence = Math.max(0, 1 - bestMatch.distance);
              const { error } = await supabase.from("attendance").insert({
                student_id: bestMatch.id,
                session_id: this.state.selectedSession,
                is_present: true,
                method: "face_recognition",
                confidence: confidence,
              });
              if (error) {
                console.error("Error marking attendance:", error);
                resolve({ status: "error" });
                return;
              }
              resolve({
                status: "recognized",
                studentName: bestMatch.studentName,
                confidence,
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

  getState(): AttendanceServiceState {
    return this.state;
  }
  isProcessing(): boolean {
    return this.state.isProcessing;
  }
  isInAttendanceMode(): boolean {
    return this.state.isAttendanceMode;
  }
  getSelectedSession(): string {
    return this.state.selectedSession;
  }
  getSessions(): SessionInfo[] {
    return this.state.sessions;
  }
  // Removed getStudents; students fetched ad-hoc with embeddings
}

export const attendanceService = new AttendanceService();
