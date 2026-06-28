import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Activity,
  BarChart3,
  Bell,
  Factory,
  Layers,
  Shield,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2">
            <Factory className="size-6" />
            <span className="text-xl font-bold tracking-tight">SignalOps</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Open App
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
              Turn operational events into actionable intelligence.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              SignalOps receives events from machines, ERPs, and sensors — then
              transforms them into real-time dashboards, analytics, and alerts.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Explore Dashboard
              </Link>
              <Link
                href="/events"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                View Live Events
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Activity}
                title="Real-Time Events"
                description="Ingest machine events and observe them live as they flow through your system."
              />
              <FeatureCard
                icon={BarChart3}
                title="Operations Analytics"
                description="Track utilization, downtime, production trends, and error frequency."
              />
              <FeatureCard
                icon={Bell}
                title="Intelligent Alerts"
                description="Detect overheating, excessive downtime, and high error rates automatically."
              />
              <FeatureCard
                icon={Layers}
                title="OLTP / OLAP Separation"
                description="Keep transactional workloads fast while analytics run on dedicated data."
              />
              <FeatureCard
                icon={Zap}
                title="Event-Driven Architecture"
                description="Built on Kafka, Debezium CDC, and asynchronous processing."
              />
              <FeatureCard
                icon={Shield}
                title="Multi-Tenant"
                description="Every organization has isolated users, machines, events, and dashboards."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="rounded-2xl border bg-card p-8 text-card-foreground shadow-sm lg:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                Built to learn modern data-intensive systems.
              </h2>
              <p className="mt-4 text-muted-foreground">
                SignalOps demonstrates event sourcing, CDC, stream processing,
                and operational intelligence — one vertical slice at a time.
              </p>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ size: "lg" }), "mt-8")}
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground lg:px-8">
          SignalOps — Enterprise Operations Intelligence Platform
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Icon className="size-8 text-primary" />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
