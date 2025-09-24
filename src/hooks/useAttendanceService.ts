import { useEffect, useState } from "react";
import {
  attendanceService,
  type AttendanceServiceState,
} from "../services/attendanceService";

/**
 * Custom hook to interact with the attendance service
 * Provides reactive state updates and convenient action methods
 */
export const useAttendanceService = () => {
  const [state, setState] = useState<AttendanceServiceState>(
    attendanceService.getState()
  );

  // Subscribe to service state changes
  useEffect(() => {
    const unsubscribe = attendanceService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Action methods
  const actions = {
    setSelectedClass: (classId: string) =>
      attendanceService.setSelectedClass(classId),
    startAttendance: () => attendanceService.startAttendance(),
    stopAttendance: () => attendanceService.stopAttendance(),
    handleFaceDetection: (imageData: string) =>
      attendanceService.handleFaceDetection(imageData),
    refreshData: () => attendanceService.refreshData(),
  };

  return {
    ...state,
    ...actions,
  };
};
