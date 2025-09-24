import { useToast } from "../hooks/use-toast";
import { useAttendanceService } from "../hooks/useAttendanceService";
import { AttendanceUI } from "./AttendanceUI";

export const AttendanceApp = () => {
  const {
    isAttendanceMode,
    isProcessing,
    selectedClass,
    classes,
    setSelectedClass,
    startAttendance,
    stopAttendance,
    handleFaceDetection,
    refreshData,
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
      selectedClass={selectedClass}
      classes={classes}
      onClassSelect={setSelectedClass}
      onStartAttendance={handleStartAttendance}
      onStopAttendance={stopAttendance}
      onFaceDetected={handleFaceDetection}
      onRefreshData={refreshData}
    />
  );
};
