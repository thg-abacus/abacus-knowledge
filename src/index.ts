#!/usr/bin/env node

/**
 * ABACUS Knowledge Server — Entry point.
 *
 * Dual-protocol MCP server for indexing and searching documentation.
 *   MCP Streamable HTTP → AI agents
 *   REST HTTP           → humans (browser upload/search)
 */
import { loadConfig } from "./config";
import { setLogLevel, logger } from "./utils/logger";
import { KnowledgeIndex } from "./indexer";
import { startServer } from "./server";

async function main() {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info("📚 ABACUS Knowledge Server starting...");
  logger.info(`   Docs path: ${config.docsPath}`);

  // Build the document index
  const index = new KnowledgeIndex(config.docsPath);
  const result = await index.build();
  if (result.errors.length) {
    logger.warn(`${result.errors.length} file(s) had indexing errors:`);
    result.errors.forEach((e) => logger.warn(`  - ${e}`));
  }

  // Start HTTP + MCP server
  await startServer(index, config.port);

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down Knowledge Server...");
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
