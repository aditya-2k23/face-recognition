export class SimpleDetectionManager {
  private isProcessing = false;
  private lastDetectionTime = 0;
  private cooldownTime: number;
  private defaultCooldownTime: number;

  constructor(cooldownTime: number = 3000) {
    this.cooldownTime = cooldownTime; // Default 3 seconds between detections
    this.defaultCooldownTime = cooldownTime;
  }

  canDetect(): boolean {
    if (this.isProcessing) return false;

    const now = Date.now();
    return now - this.lastDetectionTime >= this.cooldownTime;
  }

  startProcessing() {
    this.isProcessing = true;
  }

  endProcessing(customCooldown?: number) {
    this.isProcessing = false;
    this.lastDetectionTime = Date.now();

    // If a custom cooldown is provided, use it for the next detection
    if (customCooldown !== undefined) {
      this.cooldownTime = customCooldown;
    } else {
      // Reset to default cooldown
      this.cooldownTime = this.defaultCooldownTime;
    }
  }

  reset() {
    this.isProcessing = false;
    this.lastDetectionTime = 0;
    this.cooldownTime = this.defaultCooldownTime;
  }

  getTimeUntilNextDetection(): number {
    const elapsed = Date.now() - this.lastDetectionTime;
    return Math.max(0, this.cooldownTime - elapsed);
  }

  getCurrentCooldownTime(): number {
    return this.cooldownTime;
  }
}
