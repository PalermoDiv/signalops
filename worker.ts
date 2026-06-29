import { startWorker } from "@/lib/worker";
import { logger } from "@/lib/logger";

startWorker().catch((error) => {
  logger.fatal(error, "Worker crashed");
  process.exit(1);
});
