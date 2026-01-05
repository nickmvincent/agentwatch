/**
 * Port/server monitoring types
 * Tracks listening TCP ports and correlates them with agent processes
 */

/** A listening TCP port detected on the system */
export interface ListeningPort {
  /** Port number */
  port: number;
  /** Process ID that owns this port */
  pid: number;
  /** Process name/command */
  processName: string;
  /** Full command line of the process */
  cmdline?: string;
  /** IP address the port is bound to (e.g., "127.0.0.1", "*", "::") */
  bindAddress: string;
  /** Protocol (TCP/TCP6) */
  protocol: "tcp" | "tcp6";
  /** Associated agent PID if this port belongs to an agent's child process */
  agentPid?: number;
  /** Associated agent label if correlated */
  agentLabel?: string;
  /** Unix timestamp when first detected */
  firstSeen: number;
  /** Working directory of the process (if resolvable) */
  cwd?: string;
}

/** Common dev server port categories */
const PORT_CATEGORIES: Record<number, string> = {
  3000: "React/Next.js",
  3001: "React/Next.js",
  4000: "GraphQL",
  4200: "Angular",
  5000: "Flask/Python",
  5173: "Vite",
  5174: "Vite",
  8000: "Django/Python",
  8080: "Generic HTTP",
  8081: "Generic HTTP",
  8420: "Agentwatch",
  8888: "Jupyter",
  9000: "PHP/Generic"
};

/** Categorize a port by common dev server conventions */
export function categorizePort(port: number): string | null {
  return PORT_CATEGORIES[port] ?? null;
}

/** Check if a port is likely a dev server (common ranges) */
export function isLikelyDevServer(port: number): boolean {
  // Common dev server ranges
  if (port >= 3000 && port <= 3999) return true;
  if (port >= 4000 && port <= 4999) return true;
  if (port >= 5000 && port <= 5999) return true;
  if (port >= 8000 && port <= 8999) return true;
  if (port >= 9000 && port <= 9999) return true;
  return false;
}
