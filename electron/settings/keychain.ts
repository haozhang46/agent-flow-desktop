import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

const KEY_FILE = "deepseek-api-key.dat";

function keyPath(): string {
  return path.join(app.getPath("userData"), KEY_FILE);
}

export function saveApiKey(key: string): void {
  const file = keyPath();
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(file, safeStorage.encryptString(key));
  } else {
    fs.writeFileSync(file, Buffer.from(key, "utf8"));
  }
}

export function loadApiKey(): string | null {
  const file = keyPath();
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  return buf.toString("utf8");
}

export function clearApiKey(): void {
  const file = keyPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
