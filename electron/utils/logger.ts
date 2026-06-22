import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const LOG_DIR = path.join(os.homedir(), ".agentflow", "logs");

export type LogLevel = "INFO" | "WARN" | "ERROR" | "REQUEST" | "STARTUP";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

function getTodayLogFile(): string {
  const date = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `${date}.log`);
}

async function ensureLogDir(): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function writeLog(entry: LogEntry): Promise<void> {
  try {
    await ensureLogDir();
    const logFile = getTodayLogFile();
    const line = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";
    await fs.appendFile(logFile, `${line}${meta}\n`, "utf-8");
  } catch (err) {
    // Fallback to console to avoid crashing the server
    console.error("[Logger Error] Failed to write log:", err);
  }
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    void writeLog({ timestamp: formatTimestamp(), level: "INFO", message, meta });
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    void writeLog({ timestamp: formatTimestamp(), level: "WARN", message, meta });
  },

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const errorMeta = error ? { stack: error.stack, ...meta } : meta;
    void writeLog({ timestamp: formatTimestamp(), level: "ERROR", message, meta: errorMeta });
  },

  request(method: string, url: string, statusCode: number, durationMs: number): void {
    void writeLog({
      timestamp: formatTimestamp(),
      level: "REQUEST",
      message: `${method} ${url} ${statusCode} ${durationMs}ms`,
      meta: { method, url, statusCode, durationMs },
    });
  },

  startup(service: string, port: number): void {
    void writeLog({
      timestamp: formatTimestamp(),
      level: "STARTUP",
      message: `${service} server starting on port ${port}`,
      meta: { service, port },
    });
  },
};
