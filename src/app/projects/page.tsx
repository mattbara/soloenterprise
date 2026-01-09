import { db } from "@/lib/db";
import { projects } from "@soloenterprise/db/schema";
import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function createProject(formData: FormData) {
  "use server";
  
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name) return;

  await db.insert(projects).values({
    name,
    description,
    status: "planning",
  });

  revalidatePath("/projects");
}

export default async function ProjectsPage() {
  const allProjects = await db.query.projects.findMany({
    orderBy: [desc(projects.createdAt)],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      </div>

      {/* Create Project Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create New Project</h2>
        <form action={createProject} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Project Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="My Awesome Project"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              name="description"
              id="description"
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="What are you building?"
            />
          </div>
          <button
            type="submit"
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create Project
          </button>
        </form>
      </div>

      {/* Projects List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b">
          <h2 className="text-lg font-medium text-gray-900">All Projects</h2>
        </div>
        <ul className="divide-y divide-gray-200">
          {allProjects.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">
              No projects yet. Create one above!
            </li>
          ) : (
            allProjects.map((project) => (
              <li key={project.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
                    <p className="text-sm text-gray-500">{project.description || "No description"}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      project.status === "active" ? "bg-green-100 text-green-800" :
                      project.status === "completed" ? "bg-blue-100 text-blue-800" :
                      project.status === "paused" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {project.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(project.createdAt!).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
