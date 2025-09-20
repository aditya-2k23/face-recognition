import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Camera, Square, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "../hooks/use-toast";

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
}

export const CameraView = ({
  onFaceDetected,
  isProcessing,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
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

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isStreaming, startCamera]);

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    setLastCapture(imageData);

    try {
      const result = await onFaceDetected(imageData);

      switch (result.status) {
        case "recognized":
          toast({
            title: "✓ Attendance Marked",
            description: `${result.studentName} - Confidence: ${(
              result.confidence * 100
            ).toFixed(1)}%`,
            variant: "default",
            className: "bg-success text-success-foreground",
          });
          break;
        case "already_marked":
          toast({
            title: "Already Marked",
            description: `${result.studentName} has already been marked present today.`,
            variant: "default",
          });
          break;
        case "no_face":
          toast({
            title: "No Face Detected",
            description:
              "Please ensure your face is clearly visible and well-lit, then try again.",
            variant: "destructive",
          });
          break;
        case "not_recognized":
          toast({
            title: "❌ Face Not Recognized",
            description: "Student not found in database",
            variant: "destructive",
          });
          break;
        case "error":
        default:
          toast({
            title: "Processing Error",
            description: "Failed to process face recognition",
            variant: "destructive",
          });
          break;
      }
    } catch (error) {
      console.error("Face detection error:", error);
      toast({
        title: "Processing Error",
        description: "Failed to process face recognition",
        variant: "destructive",
      });
    }
  };

  const toggleCamera = () => {
    setIsStreaming(!isStreaming);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-md">
        {/* Video Stream */}
        <video
          ref={videoRef}
          className={`w-full h-auto rounded-lg border-2 transition-all duration-300 ${
            isStreaming ? "border-primary" : "border-border"
          }`}
          autoPlay
          playsInline
          muted
        />

        {/* Detection Overlay */}
        {isStreaming && (
          <div className="absolute inset-4 border-2 border-primary rounded-lg pointer-events-none">
            <div className="absolute top-0 left-0 w-4 h-4 border-l-4 border-t-4 border-primary rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-r-4 border-t-4 border-primary rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-l-4 border-b-4 border-primary rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-r-4 border-b-4 border-primary rounded-br-lg"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary text-sm font-medium">
              Position face here
            </div>
          </div>
        )}

        {!isStreaming && (
          <div className="absolute inset-0 bg-muted rounded-lg flex items-center justify-center">
            <Camera className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="flex gap-4">
        <Button
          onClick={toggleCamera}
          variant={isStreaming ? "destructive" : "default"}
          size="lg"
        >
          {isStreaming ? (
            <>
              <Square className="mr-2 h-4 w-4" />
              Stop Camera
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              Start Camera
            </>
          )}
        </Button>

        {isStreaming && (
          <Button
            onClick={captureFrame}
            disabled={isProcessing}
            variant="secondary"
            size="lg"
          >
            {isProcessing ? (
              <>
                <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Detect Face
              </>
            )}
          </Button>
        )}
      </div>

      {/* Last Capture Preview */}
      {lastCapture && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">Last capture:</p>
          <img
            src={lastCapture}
            alt="Last capture"
            className="w-32 h-auto rounded border"
          />
        </div>
      )}
    </div>
  );
};
