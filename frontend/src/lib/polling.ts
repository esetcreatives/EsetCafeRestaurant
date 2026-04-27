// Polling utility for real-time updates (fallback for Pusher)

type PollingCallback = () => Promise<void>;

class PollingManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  start(key: string, callback: PollingCallback, intervalMs: number = 3000) {
    if (this.intervals.has(key)) {
      this.stop(key);
    }
    
    // Set interval and store it
    const interval = setInterval(callback, intervalMs);
    this.intervals.set(key, interval);
  }
  
  stop(key: string) {
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }
  }
  
  stopAll() {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }
}

export const polling = new PollingManager();
