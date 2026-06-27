import { prisma } from "@/lib/prisma";
import { LiveRefresh } from "./live-refresh";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await prisma.event.findMany({
    orderBy: { occurredAt: "desc" },
    take: 20,
    include: {
      machine: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });

  return (
    <main className="min-h-screen bg-zinc-50 p-8 text-zinc-900">
      <LiveRefresh intervalMs={2000} />

      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold">SignalOps Live Events</h1>
        <p className="mb-6 text-zinc-600">
          Server-rendered page. Refreshes every 2 seconds.
        </p>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-600">
            Total events in DB: <strong>{events.length}</strong> (showing last{" "}
            {Math.min(events.length, 20)})
          </p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
            No events yet. POST to{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-sm">
              /api/events
            </code>{" "}
            to see them appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{event.type}</span>
                  <span className="text-sm text-zinc-500">
                    {event.occurredAt.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {event.machine.name} @ {event.organization.name}
                </div>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-100 p-2 text-xs">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
