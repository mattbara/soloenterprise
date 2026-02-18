import { db } from "@/lib/db";
import { clients } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NewProjectClient } from "./new-project-client";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const company = await db.query.clients.findFirst({
    where: eq(clients.id, companyId),
  });

  if (!company) return notFound();

  return (
    <NewProjectClient
      companyId={company.id}
      companyName={company.name}
    />
  );
}
