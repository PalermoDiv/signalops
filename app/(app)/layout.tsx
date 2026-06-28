import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentOrganization } from "@/lib/organization";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organization = await getCurrentOrganization();

  return (
    <SidebarProvider>
      <AppSidebar organization={organization} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">
              Operations Intelligence
            </span>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
