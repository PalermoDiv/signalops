import { startWorker } from "@/lib/worker";

startWorker().catch((error) => {
  console.error("Worker crashed:", error);
  process.exit(1);
});
