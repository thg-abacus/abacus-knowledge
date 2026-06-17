import dotenv from "dotenv";
import { resolve } from "path";

// Load .env from project root (or cwd)
dotenv.config({ path: [".env.local", ".env"] });

export interface AppConfig {
  port: number;
  docsPath: string;
  logLevel: string;
}

export function loadConfig(): AppConfig {
  const port = parseInt(process.env.KNOWLEDGE_PORT || "3003", 10);
  const docsPath = resolve(process.env.KNOWLEDGE_DOCS_PATH || "./docs");
  const logLevel = process.env.LOG_LEVEL || "info";

  return Object.freeze({ port, docsPath, logLevel });
}
