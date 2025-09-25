import { useState, useRef } from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Upload, UserPlus, Image as ImageIcon, Trash2 } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { supabase } from "../integration/supabase/client";
import { extractFaceDescriptor } from "../utils/faceRecognition";

interface StudentManagerProps {
  onStudentAdded: () => void;
}

export const StudentManager = ({ onStudentAdded }: StudentManagerProps) => {
  const [newStudent, setNewStudent] = useState({
    full_name: "",
    email: "",
    phone: "",
    department: "",
    enrollment_year: "", // keep as string for input then parse
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addStudent = async () => {
    if (!newStudent.full_name || !selectedPhoto) {
      toast({
        title: "Missing Information",
        description: "Please fill in required fields (Full Name & Photo).",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // First, add student to database
      const enrollmentYearNum = newStudent.enrollment_year
        ? parseInt(newStudent.enrollment_year, 10)
        : null;

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .insert({
          full_name: newStudent.full_name,
          email: newStudent.email || null,
          phone: newStudent.phone || null,
          department: newStudent.department || null,
          enrollment_year: isNaN(enrollmentYearNum!) ? null : enrollmentYearNum,
          photo_url: null, // could upload to storage later
        })
        .select()
        .single();

      if (studentError || !studentData) {
        throw new Error(studentError?.message || "Failed to add student");
      }

      // Process the photo for face recognition
      const img = new Image();
      img.onload = async () => {
        try {
          const faceDescriptor = await extractFaceDescriptor(img);

          if (!faceDescriptor) {
            // Clean up - remove student if face extraction fails
            await supabase.from("students").delete().eq("id", studentData.id);
            throw new Error(
              "No face detected in the uploaded photo. Please use a clear photo with a visible face."
            );
          }

          // Store face embedding
          const { error: embeddingError } = await supabase
            .from("face_embeddings")
            .insert({
              student_id: studentData.id,
              embedding: Array.from(faceDescriptor),
              source: "registration",
            });

          if (embeddingError) {
            // Clean up - remove student if embedding storage fails
            await supabase.from("students").delete().eq("id", studentData.id);
            throw new Error("Failed to store face data");
          }

          toast({
            title: "✓ Student Added",
            description: `${newStudent.full_name} has been enrolled with face recognition.`,
            variant: "default",
          });

          // Reset form
          setNewStudent({
            full_name: "",
            email: "",
            phone: "",
            department: "",
            enrollment_year: "",
          });
          setSelectedPhoto(null);
          setPhotoPreview("");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }

          onStudentAdded();
        } catch (error) {
          console.error("Face processing error:", error);

          // Extract specific error message for better user feedback
          let errorMessage = "Failed to process face data";
          if (error instanceof Error) {
            if (error.message.includes("No face detected")) {
              errorMessage =
                "No face detected in the image. Please ensure your face is clearly visible and well-lit.";
            } else if (error.message.includes("dimension")) {
              errorMessage =
                "Face processing error. The photo could not be processed correctly.";
            } else if (error.message.includes("Failed to store face data")) {
              errorMessage =
                "Database error while storing face data. Please try again.";
            } else {
              errorMessage = error.message;
            }
          }

          toast({
            title: "Face Processing Error",
            description: errorMessage,
            variant: "destructive",
          });
        } finally {
          setIsProcessing(false);
        }
      };

      img.onerror = () => {
        toast({
          title: "Image Error",
          description: "Failed to load the selected image.",
          variant: "destructive",
        });
        setIsProcessing(false);
      };

      img.src = photoPreview;
    } catch (error) {
      console.error("Error adding student:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to add student",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Add New Student
        </CardTitle>
        <CardDescription>
          Register a new student with their photo for face recognition
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={newStudent.full_name}
              onChange={(e) =>
                setNewStudent({ ...newStudent, full_name: e.target.value })
              }
              placeholder="Enter student's full name"
            />
          </div>
          <div>
            <Label htmlFor="email">Email (Optional)</Label>
            <Input
              id="email"
              type="email"
              value={newStudent.email}
              onChange={(e) =>
                setNewStudent({ ...newStudent, email: e.target.value })
              }
              placeholder="Enter student's email"
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone (Optional)</Label>
            <Input
              id="phone"
              value={newStudent.phone}
              onChange={(e) =>
                setNewStudent({ ...newStudent, phone: e.target.value })
              }
              placeholder="Phone number"
            />
          </div>
          <div>
            <Label htmlFor="department">Department (Optional)</Label>
            <Input
              id="department"
              value={newStudent.department}
              onChange={(e) =>
                setNewStudent({ ...newStudent, department: e.target.value })
              }
              placeholder="Department"
            />
          </div>
          <div>
            <Label htmlFor="enrollment_year">Enrollment Year (Optional)</Label>
            <Input
              id="enrollment_year"
              value={newStudent.enrollment_year}
              onChange={(e) =>
                setNewStudent({
                  ...newStudent,
                  enrollment_year: e.target.value,
                })
              }
              placeholder="e.g. 2024"
            />
          </div>
        </div>

        {/* Photo Upload */}
        <div className="space-y-2">
          <Label>Student Photo</Label>
          <div className="flex flex-col items-center gap-4">
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Student preview"
                  className="w-32 h-32 object-cover rounded-lg border-2 border-border"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                  onClick={() => {
                    setSelectedPhoto(null);
                    setPhotoPreview("");
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose Photo
              </Button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Upload a clear photo showing the student's face for accurate
            recognition.
          </p>
        </div>

        <Button
          onClick={addStudent}
          disabled={isProcessing || !newStudent.full_name || !selectedPhoto}
          className="w-full"
        >
          {isProcessing ? (
            <>Processing Face Data...</>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Student
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
