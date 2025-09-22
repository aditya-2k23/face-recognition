type DetectionResult =
  | { status: "recognized"; studentName: string; confidence: number }
  | { status: "already_marked"; studentName: string }
  | { status: "no_face" }
  | { status: "not_recognized" }
  | { status: "error" };

interface QueueItem {
  imageData: string;
  timestamp: number;
  resolve: (result: DetectionResult) => void;
  reject: (error: unknown) => void;
}

interface RateLimiterConfig {
  minTimeBetweenDetections: number; // Minimum time between detection attempts
  maxQueueSize: number; // Maximum number of items in queue
  cooldownAfterSuccess: number; // Cooldown after successful detection
  cooldownAfterFailure: number; // Cooldown after failed detection
  maxRetriesPerMinute: number; // Max detection attempts per minute
}

export class FaceDetectionRateLimiter {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private lastDetectionTime = 0;
  private detectionHistory: number[] = [];
  private cooldownUntil = 0;
  private config: RateLimiterConfig;
  private onFaceDetected: (imageData: string) => Promise<DetectionResult>;
  private listeners: Set<(status: RateLimiterStatus) => void> = new Set();

  constructor(
    onFaceDetected: (imageData: string) => Promise<DetectionResult>,
    config?: Partial<RateLimiterConfig>
  ) {
    this.onFaceDetected = onFaceDetected;
    this.config = {
      minTimeBetweenDetections: 2000, // 2 seconds minimum between detections
      maxQueueSize: 3, // Keep only 3 items in queue
      cooldownAfterSuccess: 5000, // 5 second cooldown after success
      cooldownAfterFailure: 3000, // 3 second cooldown after failure
      maxRetriesPerMinute: 15, // Max 15 attempts per minute
      ...config,
    };
  }

  // Subscribe to status updates
  subscribe(listener: (status: RateLimiterStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(status: RateLimiterStatus) {
    this.listeners.forEach((listener) => listener(status));
  }

  // Check if we're currently rate limited
  private isRateLimited(): boolean {
    const now = Date.now();

    // Check cooldown
    if (now < this.cooldownUntil) {
      return true;
    }

    // Check minimum time between detections
    if (now - this.lastDetectionTime < this.config.minTimeBetweenDetections) {
      return true;
    }

    // Check rate limit per minute
    const oneMinuteAgo = now - 60000;
    this.detectionHistory = this.detectionHistory.filter(
      (time) => time > oneMinuteAgo
    );

    if (this.detectionHistory.length >= this.config.maxRetriesPerMinute) {
      return true;
    }

    return false;
  }

  // Add detection request to queue
  async detectFace(imageData: string): Promise<DetectionResult> {
    return new Promise((resolve, reject) => {
      const now = Date.now();

      // Check if rate limited
      if (this.isRateLimited()) {
        const timeUntilReady = Math.max(
          this.cooldownUntil - now,
          this.config.minTimeBetweenDetections - (now - this.lastDetectionTime)
        );

        this.notifyListeners({
          status: "rate_limited",
          message: `Rate limited. Try again in ${Math.ceil(
            timeUntilReady / 1000
          )}s`,
          queueSize: this.queue.length,
          isProcessing: this.isProcessing,
        });

        resolve({ status: "error" });
        return;
      }

      // Check queue size
      if (this.queue.length >= this.config.maxQueueSize) {
        // Remove oldest item if queue is full
        const removed = this.queue.shift();
        if (removed) {
          removed.reject(
            new Error("Removed from queue - too many pending requests")
          );
        }
      }

      // Add to queue
      this.queue.push({
        imageData,
        timestamp: now,
        resolve,
        reject,
      });

      this.notifyListeners({
        status: "queued",
        message: "Detection queued",
        queueSize: this.queue.length,
        isProcessing: this.isProcessing,
      });

      // Process queue if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  // Process the detection queue
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Check rate limit before processing
      if (this.isRateLimited()) {
        const waitTime = Math.max(
          this.cooldownUntil - Date.now(),
          this.config.minTimeBetweenDetections
        );

        this.notifyListeners({
          status: "waiting",
          message: `Waiting ${Math.ceil(
            waitTime / 1000
          )}s before next detection`,
          queueSize: this.queue.length,
          isProcessing: true,
        });

        await this.delay(waitTime);
      }

      const item = this.queue.shift();
      if (!item) continue;

      try {
        const now = Date.now();
        this.lastDetectionTime = now;
        this.detectionHistory.push(now);

        this.notifyListeners({
          status: "processing",
          message: "Processing face detection",
          queueSize: this.queue.length,
          isProcessing: true,
        });

        // Perform the actual face detection
        const result = await this.onFaceDetected(item.imageData);

        // Apply cooldown based on result
        if (
          result.status === "recognized" ||
          result.status === "already_marked"
        ) {
          this.cooldownUntil = now + this.config.cooldownAfterSuccess;
          this.notifyListeners({
            status: "success",
            message: `Detection successful: ${
              result.status === "recognized"
                ? result.studentName
                : "Already marked"
            }`,
            queueSize: this.queue.length,
            isProcessing: true,
          });
        } else if (
          result.status === "not_recognized" ||
          result.status === "no_face"
        ) {
          this.cooldownUntil = now + this.config.cooldownAfterFailure;
          this.notifyListeners({
            status: "failed",
            message:
              result.status === "no_face"
                ? "No face detected"
                : "Face not recognized",
            queueSize: this.queue.length,
            isProcessing: true,
          });
        }

        item.resolve(result);

        // Add delay between queue items
        if (this.queue.length > 0) {
          await this.delay(this.config.minTimeBetweenDetections);
        }
      } catch (error) {
        console.error("Error processing detection:", error);
        item.reject(error);

        // Apply failure cooldown
        this.cooldownUntil = Date.now() + this.config.cooldownAfterFailure;
      }
    }

    this.isProcessing = false;
    this.notifyListeners({
      status: "idle",
      message: "Ready for detection",
      queueSize: 0,
      isProcessing: false,
    });
  }

  // Helper method for delays
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Clear the queue
  clearQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.reject(new Error("Queue cleared"));
      }
    }
    this.notifyListeners({
      status: "idle",
      message: "Queue cleared",
      queueSize: 0,
      isProcessing: false,
    });
  }

  // Reset rate limiter
  reset() {
    this.clearQueue();
    this.isProcessing = false;
    this.lastDetectionTime = 0;
    this.detectionHistory = [];
    this.cooldownUntil = 0;
  }

  // Get current status
  getStatus(): RateLimiterStatus {
    return {
      status: this.isProcessing ? "processing" : "idle",
      message: "",
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      cooldownRemaining: Math.max(0, this.cooldownUntil - Date.now()),
      detectionCount: this.detectionHistory.length,
    };
  }
}

export interface RateLimiterStatus {
  status:
    | "idle"
    | "queued"
    | "processing"
    | "waiting"
    | "rate_limited"
    | "success"
    | "failed";
  message: string;
  queueSize: number;
  isProcessing: boolean;
  cooldownRemaining?: number;
  detectionCount?: number;
}
