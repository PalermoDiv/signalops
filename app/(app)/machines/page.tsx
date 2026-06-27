import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Machines — SignalOps",
};

export default function MachinesPage() {
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
          <CardDescription>All machines across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <p className="text-sm">Machine management coming in M4.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
