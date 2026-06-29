import { kafka, EVENTS_TOPIC, DLQ_TOPIC } from "@/lib/kafka";
import {
  evaluateAlertRules,
  updateMachineStatusFromEvent,
} from "@/lib/operations";
import { deleteCached } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { EventType } from "@prisma/client";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface DebeziumEvent {
  op: "c" | "r" | "u" | "d";
  after: {
    id: string;
    organization_id: string;
    machine_id: string;
    type: EventType;
    payload: unknown;
    occurred_at: string;
  } | null;
}

export function parseEvent(messageValue: unknown): DebeziumEvent["after"] | null {
  if (typeof messageValue !== "object" || messageValue === null) return null;
  const message = messageValue as { payload?: unknown };
  const envelope =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as { op?: string; after?: unknown })
      : null;
  if (!envelope) return null;
  if (envelope.op !== "c" && envelope.op !== "r") return null;
  if (typeof envelope.after !== "object" || envelope.after === null)
    return null;
  return envelope.after as DebeziumEvent["after"];
}

export async function processEvent(row: NonNullable<DebeziumEvent["after"]>) {
  await updateMachineStatusFromEvent(row.machine_id, row.type);
  await evaluateAlertRules(
    row.organization_id,
    row.machine_id,
    row.type,
    row.payload as Parameters<typeof evaluateAlertRules>[3],
    new Date(row.occurred_at)
  );
  // ponytail: clear cached metrics so dashboards pick up async side effects quickly.
  await deleteCached(`metrics:${row.organization_id}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startWorker() {
  // ponytail: explicit session timeouts avoid KafkaJS defaulting to unexpected values
  // when running against a single-node local Kafka.
  const consumer = kafka.consumer({
    groupId: "signalops-event-processors",
    sessionTimeout: 30000,
    rebalanceTimeout: 60000,
    heartbeatInterval: 3000,
  });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: EVENTS_TOPIC, fromBeginning: false });

  // ponytail: exponential backoff retry, then DLQ. Add persistent DLQ storage if volume grows.
  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString();
      if (!value) return;

      let parsed: ReturnType<typeof parseEvent>;
      try {
        parsed = parseEvent(JSON.parse(value));
  } catch {
    logger.error({ message: value.slice(0, 200) }, "Failed to parse message, skipping");
    return;
  }

      if (!parsed) return;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await processEvent(parsed);
          return;
        } catch (error) {
          const isLast = attempt === MAX_RETRIES;
          logger.error(
            {
              attempt: attempt + 1,
              maxAttempts: MAX_RETRIES + 1,
              eventId: parsed.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Processing failed"
          );

          if (isLast) {
            await producer.send({
              topic: DLQ_TOPIC,
              messages: [
                {
                  key: parsed.id,
                  value: JSON.stringify({
                    original: parsed,
                    error:
                      error instanceof Error ? error.message : String(error),
                    failedAt: new Date().toISOString(),
                  }),
                },
              ],
            });
            logger.error({ eventId: parsed.id }, "Sent event to DLQ");
            return;
          }

          await sleep(RETRY_DELAY_MS * 2 ** attempt);
        }
      }
    },
  });

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await consumer.disconnect();
    await producer.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info({ topic: EVENTS_TOPIC }, "Worker subscribed");
}
