import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { SimpleDetectionManager } from "../utils/simpleDetectionManager";

interface CameraViewProps {
  onFaceDetected: (
    imageData: string
  ) => Promise<
    | { status: "recognized"; studentName: string; confidence: number }
    | { status: "already_marked"; studentName: string }
    | { status: "no_face" }
    | { status: "not_recognized" }
    | { status: "error" }
  >;
  isProcessing: boolean;
  start: boolean;
}

export const CameraView = ({
  onFaceDetected,
  isProcessing: externalProcessing,
  start,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const detectionManagerRef = useRef<SimpleDetectionManager>(
    new SimpleDetectionManager(3000)
  ); // 3 second cooldown

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const { toast } = useToast();

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        title: "Camera Error",
        description: "Could not access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    detectionManagerRef.current.reset();
    setDetectionMessage("");
    setCooldownRemaining(0);
  }, []);

  // Separate function to handle detection processing
  const processDetection = useCallback(
    async (imageData: string, manager: SimpleDetectionManager) => {
      let result: {
        status:
          | "recognized"
          | "already_marked"
          | "no_face"
          | "not_recognized"
          | "error";
        studentName?: string;
        confidence?: number;
      } | null = null;

      try {
        result = await onFaceDetected(imageData);

        // Batch state updates to prevent flickering
        let newMessage = "";
        let toastConfig: {
          title: string;
          description: string;
          variant?: "default" | "destructive";
          className?: string;
        } | null = null;

        switch (result.status) {
          case "recognized":
            newMessage = `✓ ${result.studentName} marked present`;
            toastConfig = {
              title: "✓ Attendance Marked",
              description: `${result.studentName} - Confidence: ${(
                (result.confidence || 0) * 100
              ).toFixed(1)}%`,
              variant: "default",
              className: "bg-green-500 text-white",
            };
            break;

          case "already_marked":
            newMessage = `${result.studentName} already marked`;
            toastConfig = {
              title: "Already Marked",
              description: `${result.studentName} has already been marked present today.`,
              variant: "default",
            };
            break;

          case "no_face":
            newMessage = "No face detected";
            break;

          case "not_recognized":
            newMessage = "Face not recognized";
            break;

          case "error":
            newMessage = "Error occurred";
            break;
        }

        // Single state update to prevent flickering
        setDetectionMessage(newMessage);

        // Show toast if needed
        if (toastConfig) {
          toast(toastConfig);
        }
      } catch (error) {
        console.error("Face detection error:", error);
        setDetectionMessage("Error processing");
        result = { status: "error" }; // Set default result for error case
      } finally {
        // Determine cooldown based on detection result
        let customCooldown: number | undefined;

        // Apply 5-second cooldown for successful verifications
        if (
          result &&
          (result.status === "recognized" || result.status === "already_marked")
        ) {
          customCooldown = 5000; // 5 seconds for successful detection
        }
        // Use default 3-second cooldown for other cases (no_face, not_recognized, error)

        // End processing with appropriate cooldown
        manager.endProcessing(customCooldown);
        setIsDetecting(false);

        // Clear message after 2 seconds
        setTimeout(() => {
          setDetectionMessage("");
        }, 2000);
      }
    },
    [onFaceDetected, toast]
  );

  const captureAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || externalProcessing) {
      return;
    }

    const manager = detectionManagerRef.current;

    // Check if we can detect
    if (!manager.canDetect()) {
      const timeRemaining = manager.getTimeUntilNextDetection();
      setCooldownRemaining(Math.ceil(timeRemaining / 1000));
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Start processing
    manager.startProcessing();
    setIsDetecting(true);
    setDetectionMessage("Scanning...");
    setCooldownRemaining(0);

    // Only resize canvas if dimensions have changed
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Use requestAnimationFrame for smoother canvas operations
    requestAnimationFrame(() => {
      ctx.drawImage(video, 0, 0);

      // Get image data after drawing is complete
      const imageData = canvas.toDataURL("image/jpeg", 0.8);

      // Process detection without blocking the UI
      processDetection(imageData, manager);
    });
  }, [externalProcessing, processDetection]);

  // Start/stop automatic detection based on `start` prop
  useEffect(() => {
    if (start) {
      startCamera();

      // Run detection check every 1000ms (reduced from 500ms to prevent flickering)
      detectionIntervalRef.current = setInterval(() => {
        captureAndDetect();
      }, 1000);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [start, startCamera, stopCamera, captureAndDetect]);

  // Update cooldown display - use a more efficient update pattern
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        const newValue = Math.max(0, prev - 1);
        if (newValue === 0) {
          clearInterval(interval);
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-md">
        {/* Video Stream */}
        <video
          ref={videoRef}
          className={`w-full h-auto rounded-lg border-2 transition-all duration-300 ${
            start
              ? isDetecting
                ? "border-yellow-500"
                : cooldownRemaining > 0
                ? "border-blue-500"
                : "border-green-500"
              : "border-border"
          }`}
          autoPlay
          playsInline
          muted
        />

        {/* Detection Overlay */}
        {start && (
          <>
            {/* Face positioning guide */}
            <div className="absolute inset-4 border-2 border-primary/30 rounded-lg pointer-events-none">
              <div className="absolute top-0 left-0 w-4 h-4 border-l-4 border-t-4 border-primary rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-r-4 border-t-4 border-primary rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-l-4 border-b-4 border-primary rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-r-4 border-b-4 border-primary rounded-br-lg"></div>
            </div>

            {/* Status Bar */}
            <div className="absolute top-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {isDetecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-yellow-500" />
                      <span className="text-sm font-medium">Scanning...</span>
                    </>
                  ) : cooldownRemaining > 0 ? (
                    <>
                      <AlertCircle className="h-4 w-4 mr-2 text-blue-500" />
                      <span className="text-sm font-medium">
                        {cooldownRemaining > 3
                          ? `Extended cooldown: ${cooldownRemaining}s`
                          : `Next scan in ${cooldownRemaining}s`}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      <span className="text-sm font-medium">Ready</span>
                    </>
                  )}
                </div>
              </div>

              {detectionMessage && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {detectionMessage}
                </div>
              )}
            </div>
          </>
        )}

        {!start && (
          <div className="absolute inset-0 bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center p-4">
              <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click below to start automatic attendance
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The camera will continuously scan for faces
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Info */}
      {start && (
        <div className="text-center max-w-sm">
          <p className="text-sm text-muted-foreground">
            Position faces clearly in the frame. The system will automatically
            detect and mark attendance.
          </p>
        </div>
      )}

      {/* Simple Info Box */}
      {start && (
        <div className="w-full max-w-md bg-muted/50 rounded-lg p-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Mode:</span>
            <span className="font-medium">Continuous Scanning</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">Scan Interval:</span>
            <span className="font-medium">1 second</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">Cooldown:</span>
            <span className="font-medium">
              {cooldownRemaining > 3 ? "5s after success" : "3s normal"}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">Next scan:</span>
            <span className="font-medium">
              {cooldownRemaining > 0 ? `${cooldownRemaining}s` : "Ready"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
