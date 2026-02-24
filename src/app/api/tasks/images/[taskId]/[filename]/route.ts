import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { GENERATED_UPLOADS_DIR } from "@soloenterprise/core";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string; filename: string }> }
) {
  const { taskId, filename } = await params;

  // Validate params to prevent path traversal
  if (
    !taskId ||
    !filename ||
    taskId.includes("..") ||
    filename.includes("..") ||
    taskId.includes("/") ||
    filename.includes("/")
  ) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const filePath = resolve(GENERATED_UPLOADS_DIR, taskId, filename);

  // Ensure resolved path is within uploads directory
  const uploadsBase = GENERATED_UPLOADS_DIR;
  if (!filePath.startsWith(uploadsBase)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const buffer = await readFile(filePath);
    const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
