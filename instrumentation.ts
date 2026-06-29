import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

// ponytail: start the SDK at module load so the HTTP module is patched before
// Next.js creates the dev server. register() is kept because Next.js expects it.
if (
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NODE_ENV !== "test"
) {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

export function register() {}
