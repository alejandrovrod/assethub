export const MAX_SAMPLES = 5;
export const CRITICAL_SKEW_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export class ClockSkewManager {
  private samples: number[] = [];

  constructor(initialSamples: number[] = []) {
    for (const s of initialSamples) {
      this.addSample(s);
    }
  }

  /**
   * Adds a new clock skew measurement in milliseconds.
   * Maintains a rolling window of up to MAX_SAMPLES (5).
   */
  addSample(skewMs: number): void {
    if (this.samples.length >= MAX_SAMPLES) {
      this.samples.shift();
    }
    this.samples.push(skewMs);
  }

  /**
   * Calculates skew between server date and local timestamp.
   */
  static calculateSkew(serverDate: string | Date, localNowMs: number = Date.now()): number {
    const serverMs = typeof serverDate === 'string' ? Date.parse(serverDate) : serverDate.getTime();
    if (isNaN(serverMs)) {
      return 0;
    }
    return serverMs - localNowMs;
  }

  /**
   * Returns the median skew across recorded samples.
   */
  getMedianSkew(): number {
    if (this.samples.length === 0) {
      return 0;
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid];
    }
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  /**
   * Returns current time adjusted for clock skew.
   */
  displayNow(localNowMs: number = Date.now()): Date {
    return new Date(localNowMs + this.getMedianSkew());
  }

  /**
   * Checks if skew exceeds the 10-minute critical guard threshold.
   */
  isSkewCritical(thresholdMs: number = CRITICAL_SKEW_THRESHOLD_MS): boolean {
    return Math.abs(this.getMedianSkew()) > thresholdMs;
  }

  getSamples(): number[] {
    return [...this.samples];
  }

  reset(): void {
    this.samples = [];
  }
}

export const defaultClockSkew = new ClockSkewManager();

