import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentOrganization() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    // ponytail: M3 requires an active org. Redirect to a setup page in the future.
    // For now, redirect to login.
    redirect("/login");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    redirect("/login");
  }

  return organization;
}

export async function getCurrentOrganizationId() {
  const organization = await getCurrentOrganization();
  return organization.id;
}
