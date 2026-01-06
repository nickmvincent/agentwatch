/**
 * Browser lifecycle management for analyzer.
 * Handles heartbeat-based shutdown when browser closes.
 */

export interface BrowserLifecycleOptions {
  /** Heartbeat interval expected from client (ms) */
  heartbeatIntervalMs?: number;
  /** Timeout after which to shutdown if no heartbeat (ms) */
  shutdownTimeoutMs?: number;
  /** Callback when shutdown triggered */
  onShutdown?: () => void;
}

export class BrowserLifecycle {
  private lastHeartbeat = Date.now();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs: number;
  private shutdownTimeoutMs: number;
  private onShutdown?: () => void;

  constructor(options: BrowserLifecycleOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30000;
    this.onShutdown = options.onShutdown;
  }

  /** Start monitoring for heartbeats */
  start(): void {
    if (this.checkInterval) return;

    this.lastHeartbeat = Date.now();
    this.checkInterval = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > this.shutdownTimeoutMs) {
        console.log("No heartbeat received, shutting down...");
        this.stop();
        this.onShutdown?.();
      }
    }, this.heartbeatIntervalMs);
  }

  /** Stop monitoring */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /** Record heartbeat from client */
  recordHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  /** Get time since last heartbeat */
  getTimeSinceLastHeartbeat(): number {
    return Date.now() - this.lastHeartbeat;
  }
}
