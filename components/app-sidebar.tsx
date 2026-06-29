"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Settings,
  Cog,
  Bell,
  Factory,
  FileBarChart,
} from "lucide-react";

import { SignOutButton } from "@/components/sign-out-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Events", href: "/events", icon: Zap },
  { name: "Machines", href: "/machines", icon: Cog },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Reports", href: "/reports", icon: FileBarChart },
];

export function AppSidebar({
  organization,
}: {
  organization: { id: string; name: string };
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="SignalOps"
              render={<Link href="/dashboard" />}
            >
              <Factory className="size-4" />
              <span className="font-semibold">SignalOps</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="size-4" />
                    <span>{item.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupLabel>Organization</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings">
                  <Settings className="size-4" />
                  <span>{organization.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SignOutButton />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
