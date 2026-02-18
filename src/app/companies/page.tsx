import { db } from "@/lib/db";
import { clients, projects } from "@soloenterprise/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { CompaniesClient } from "./companies-client";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await db
    .select({
      id: clients.id,
      name: clients.name,
      contactName: clients.contactName,
      contactEmail: clients.contactEmail,
      whatsappContact: clients.whatsappContact,
      projectCount: count(projects.id),
      createdAt: clients.createdAt,
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .groupBy(clients.id)
    .orderBy(desc(clients.createdAt));

  // Serialize dates for client component
  const serialized = companies.map((c) => ({
    ...c,
    createdAt: c.createdAt?.toISOString() ?? null,
  }));

  return <CompaniesClient companies={serialized} />;
}
