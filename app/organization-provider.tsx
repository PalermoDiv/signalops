"use client";

import { createContext, useContext, ReactNode } from "react";

export type Organization = {
  id: string;
  name: string;
};

const OrganizationContext = createContext<Organization | null>(null);

export function OrganizationProvider({
  children,
  organization,
}: {
  children: ReactNode;
  organization: Organization;
}) {
  return (
    <OrganizationContext.Provider value={organization}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const organization = useContext(OrganizationContext);

  if (!organization) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider"
    );
  }

  return organization;
}
