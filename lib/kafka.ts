import { Kafka } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");

export const kafka = new Kafka({
  clientId: "signalops-worker",
  brokers,
});

export const EVENTS_TOPIC = "signalops.public.events";
export const DLQ_TOPIC = "signalops.public.events.dlq";
