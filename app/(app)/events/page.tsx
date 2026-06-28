import { prisma } from "@/lib/prisma";
import { LiveRefresh } from "../../live-refresh";
import { getCurrentOrganizationId } from "@/lib/organization";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const organizationId = await getCurrentOrganizationId();

  const events = await prisma.event.findMany({
    where: { organizationId },
    orderBy: { occurredAt: "desc" },
    take: 20,
    include: {
      machine: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <LiveRefresh intervalMs={2000} />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live Events</h1>
        <p className="text-muted-foreground">
          Server-rendered stream. Refreshes every 2 seconds.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">
          Total events in DB: <strong>{events.length}</strong> (showing last{" "}
          {Math.min(events.length, 20)})
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-muted-foreground">
          No events yet. POST to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">
            /api/events
          </code>{" "}
          to see them appear here.
        </div>
      ) : (
        <ul className="grid gap-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{event.type}</span>
                <span className="text-sm text-muted-foreground">
                  {event.occurredAt.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {event.machine.name} @ {event.organization.name}
              </div>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
