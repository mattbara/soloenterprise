import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, count, isNotNull } from "drizzle-orm";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SoloEnterprise Dashboard",
  description: "AI Agent Orchestration System",
};

async function getErrorCounts() {
  const [failedCount] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, "failed"));

  const tasksWithResult = await db.query.tasks.findMany({
    where: isNotNull(tasks.result),
    columns: { result: true },
    limit: 200,
  });

  const warningCount = tasksWithResult.filter(
    (t) => t.result?.outputs?.warnings && t.result.outputs.warnings.length > 0
  ).length;

  return { errors: failedCount.count, warnings: warningCount };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const errorCounts = await getErrorCounts();

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-50">
          <AppSidebar
            errorCount={errorCounts.errors}
            warningCount={errorCounts.warnings}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
