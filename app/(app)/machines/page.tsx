import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentOrganization } from "@/lib/organization";
import { getMachines, statusVariant } from "@/lib/operations";

export const metadata = {
  title: "Machines — SignalOps",
};

export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  const organization = await getCurrentOrganization();
  const machines = await getMachines(organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Machines</h1>
        <p className="text-muted-foreground">
          Manage and monitor your equipment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Machine List</CardTitle>
          <CardDescription>
            {machines.length} machine{machines.length === 1 ? "" : "s"} across{" "}
            {organization.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <p className="text-sm">No machines yet.</p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {machines.map((machine) => (
                <li
                  key={machine.id}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <p className="font-semibold">{machine.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {machine.location ?? "No location"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={statusVariant(machine.status)}>
                      {machine.status}
                    </Badge>
                    {machine.lastEvent && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last event: {machine.lastEvent.type} @{" "}
                        {machine.lastEvent.occurredAt.toLocaleString()}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
