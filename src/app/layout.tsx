import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, count, isNotNull } from "drizzle-orm";
import { NavErrorsLink } from "@/components/NavErrorsLink";
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
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex">
                  <div className="flex-shrink-0 flex items-center">
                    <span className="text-xl font-bold text-gray-900">
                      SoloEnterprise
                    </span>
                  </div>
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    <Link
                      href="/"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/projects"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Projects
                    </Link>
                    <Link
                      href="/tasks"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Tasks
                    </Link>
                    <Link
                      href="/questions"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Questions
                    </Link>
                    <Link
                      href="/briefs"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Briefs
                    </Link>
                    <Link
                      href="/metrics"
                      prefetch={false}
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Metrics
                    </Link>
                    <NavErrorsLink
                      errorCount={errorCounts.errors}
                      warningCount={errorCounts.warnings}
                    />
                  </div>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
