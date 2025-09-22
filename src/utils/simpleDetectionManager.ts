export class SimpleDetectionManager {
  private isProcessing = false;
  private lastDetectionTime = 0;
  private cooldownTime: number;

  constructor(cooldownTime: number = 3000) {
    this.cooldownTime = cooldownTime; // Default 3 seconds between detections
  }

  canDetect(): boolean {
    if (this.isProcessing) return false;

    const now = Date.now();
    return now - this.lastDetectionTime >= this.cooldownTime;
  }

  startProcessing() {
    this.isProcessing = true;
  }

  endProcessing() {
    this.isProcessing = false;
    this.lastDetectionTime = Date.now();
  }

  reset() {
    this.isProcessing = false;
    this.lastDetectionTime = 0;
  }

  getTimeUntilNextDetection(): number {
    const elapsed = Date.now() - this.lastDetectionTime;
    return Math.max(0, this.cooldownTime - elapsed);
  }
}
