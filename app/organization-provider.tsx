"use client";

import { createContext, useContext, ReactNode } from "react";

export type Organization = {
  id: string;
  name: string;
};

const demoOrganization: Organization = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Acme Manufacturing",
};

const OrganizationContext = createContext<Organization | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  // ponytail: hardcoded demo org for M2. Replace with session/auth resolution in M3.
  return (
    <OrganizationContext.Provider value={demoOrganization}>
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
