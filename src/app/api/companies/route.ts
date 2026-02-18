import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, projects } from "@soloenterprise/db/schema";
import { desc, eq, sql, count } from "drizzle-orm";

/**
 * GET /api/companies — List all companies with project count
 */
export async function GET() {
  try {
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        contactName: clients.contactName,
        contactEmail: clients.contactEmail,
        whatsappContact: clients.whatsappContact,
        notes: clients.notes,
        status: clients.status,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
        projectCount: count(projects.id),
      })
      .from(clients)
      .leftJoin(projects, eq(projects.clientId, clients.id))
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies — Create a new company
 *
 * Body: { name: string, contactName?: string, contactEmail?: string, whatsappContact?: string, notes?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, contactName, contactEmail, whatsappContact, notes } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const [company] = await db
      .insert(clients)
      .values({
        name: name.trim(),
        contactName: contactName?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        whatsappContact: whatsappContact?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("Failed to create company:", error);
    return NextResponse.json(
      { error: "Failed to create company" },
      { status: 500 }
    );
  }
}
