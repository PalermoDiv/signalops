import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrganizationProvider } from "./organization-provider";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SignalOps — Operations Intelligence",
  description:
    "Real-time dashboards, analytics, and alerts for operations managers.",
};

async function getOrganizationForLayout() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.session.activeOrganizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.session.activeOrganizationId },
      select: { id: true, name: true },
    });

    if (organization) {
      return organization;
    }
  }

  // ponytail: fallback demo org for public pages and unauthenticated users.
  // Remove once every user is required to have an active organization.
  return { id: "00000000-0000-0000-0000-000000000001", name: "Acme Manufacturing" };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organization = await getOrganizationForLayout();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <OrganizationProvider organization={organization}>
            {children}
          </OrganizationProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
