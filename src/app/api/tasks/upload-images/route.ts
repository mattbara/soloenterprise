import { NextResponse } from "next/server";
import { db } from "@soloenterprise/db";
import { tasks } from "@soloenterprise/db/schema";
import type { ImageAttachment } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { writeFile, mkdir, unlink } from "fs/promises";
import { resolve } from "path";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file
const MAX_DIMENSION = 1568; // Claude's optimal image size
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Magic bytes for mime type validation
const MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header
  "image/gif": [0x47, 0x49, 0x46], // GIF
};

function detectMimeType(buffer: Buffer): string | null {
  for (const [mime, bytes] of Object.entries(MAGIC_BYTES)) {
    if (bytes.every((b, i) => buffer[i] === b)) {
      // Extra check for WebP: bytes 8-11 must be WEBP
      if (mime === "image/webp") {
        if (
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        ) {
          return mime;
        }
        continue;
      }
      return mime;
    }
  }
  return null;
}

function sanitizeFilename(name: string): string {
  // Strip path components and dangerous chars
  const base = name.replace(/^.*[\\/]/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  // Prefix with UUID to prevent collisions
  return `${randomUUID().slice(0, 8)}_${base}`;
}

function getUploadsDir(taskId: string): string {
  return resolve(
    process.cwd(),
    "packages/core/generated/uploads",
    taskId
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const taskId = formData.get("taskId") as string | null;
    const files = formData.getAll("files") as File[];

    // Validate taskId
    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    // Validate task exists
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Validate file count
    if (!files.length) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 }
      );
    }

    const existingAttachments =
      (task.imageAttachments as ImageAttachment[] | null) ?? [];

    // Create upload directory
    const uploadsDir = getUploadsDir(taskId);
    await mkdir(uploadsDir, { recursive: true });

    const newAttachments: ImageAttachment[] = [];

    for (const file of files) {
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 2MB limit` },
          { status: 400 }
        );
      }

      // Read buffer and validate magic bytes
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const detectedMime = detectMimeType(buffer);
      if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
        return NextResponse.json(
          {
            error: `File "${file.name}" is not a valid image. Allowed: PNG, JPEG, WebP, GIF.`,
          },
          { status: 400 }
        );
      }

      // Resize to max 1568px on longest edge (Claude's optimal size)
      const resized = await sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .toBuffer();

      // Determine output extension based on detected mime
      const extMap: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
      };
      const ext = extMap[detectedMime] ?? ".png";

      const sanitizedName = sanitizeFilename(file.name);
      const finalName = sanitizedName.endsWith(ext)
        ? sanitizedName
        : sanitizedName.replace(/\.[^.]+$/, ext);

      const filePath = resolve(uploadsDir, finalName);
      await writeFile(filePath, resized);

      // Store relative path from project root
      const relativePath = `generated/uploads/${taskId}/${finalName}`;

      newAttachments.push({
        url: relativePath,
        mimeType: detectedMime,
        name: file.name,
      });
    }

    // Update task with new attachments
    const allAttachments = [...existingAttachments, ...newAttachments];
    await db
      .update(tasks)
      .set({ imageAttachments: allAttachments })
      .where(eq(tasks.id, taskId));

    return NextResponse.json({ attachments: allAttachments }, { status: 200 });
  } catch (error) {
    console.error("Failed to upload images:", error);
    return NextResponse.json(
      { error: "Failed to upload images" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/upload-images
 * Remove a single image from a task's attachments.
 * Body: { taskId: string, url: string }
 */
export async function DELETE(request: Request) {
  try {
    const { taskId, url } = await request.json();

    if (!taskId || !url) {
      return NextResponse.json(
        { error: "taskId and url are required" },
        { status: 400 }
      );
    }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const attachments =
      (task.imageAttachments as ImageAttachment[] | null) ?? [];
    const updated = attachments.filter((a) => a.url !== url);

    if (updated.length === attachments.length) {
      return NextResponse.json(
        { error: "Image not found in attachments" },
        { status: 404 }
      );
    }

    // Delete file from disk
    try {
      const filePath = resolve(
        process.cwd(),
        "packages/core",
        url
      );
      await unlink(filePath);
    } catch {
      // File may already be gone — not a hard error
    }

    // Update DB
    await db
      .update(tasks)
      .set({
        imageAttachments: updated.length > 0 ? updated : null,
      })
      .where(eq(tasks.id, taskId));

    return NextResponse.json({ attachments: updated }, { status: 200 });
  } catch (error) {
    console.error("Failed to remove image:", error);
    return NextResponse.json(
      { error: "Failed to remove image" },
      { status: 500 }
    );
  }
}
