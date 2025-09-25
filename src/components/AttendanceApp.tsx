import { useToast } from "../hooks/use-toast";
import { useAttendanceService } from "../hooks/useAttendanceService";
import { AttendanceUI } from "./AttendanceUI";

export const AttendanceApp = () => {
  const {
    isAttendanceMode,
    isProcessing,
    selectedSession,
    sessions,
    setSelectedSession,
    startAttendance,
    stopAttendance,
    handleFaceDetection,
  } = useAttendanceService();

  const { toast } = useToast();

  // Enhanced start attendance with error handling
  const handleStartAttendance = async () => {
    const result = await startAttendance();

    if (!result.success) {
      toast({
        title: "Cannot start attendance",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <AttendanceUI
      isAttendanceMode={isAttendanceMode}
      isProcessing={isProcessing}
      selectedSession={selectedSession}
      sessions={sessions}
      onSessionSelect={setSelectedSession}
      onStartAttendance={handleStartAttendance}
      onStopAttendance={stopAttendance}
      onFaceDetected={handleFaceDetection}
    />
  );
};
