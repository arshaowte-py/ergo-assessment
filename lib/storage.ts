import { driveThumbnailUrl, uploadFile as uploadToDrive } from "./drive";
import { env } from "./env";
import { PhotoAngle } from "./schema";
import { uploadObject } from "./supabase";

/**
 * One entry point for stored files, so the rest of the app never names a
 * provider. Supabase is used when it's configured; otherwise we fall back to
 * Drive, which keeps existing deployments working and makes the switch a matter
 * of setting two env vars rather than a code change.
 */
export type StorageBackend = "supabase" | "drive";

export function storageBackend(): StorageBackend {
  return env.supabaseUrl && env.supabaseServiceKey ? "supabase" : "drive";
}

export function storageConfigured(): boolean {
  return storageBackend() === "supabase" || Boolean(env.driveFolderId);
}

/** Object path for a photo. Grouping by assessment keeps the bucket browsable. */
export function photoPath(id: string, angle: PhotoAngle): string {
  return `${id}/${angle}.jpg`;
}

export function reportPath(id: string, fileName: string): string {
  return `${id}/${fileName}`;
}

/**
 * Write a file and return the link to store in the sheet.
 *
 * Both backends overwrite in place on re-sync, so the link recorded against an
 * assessment stays valid for the life of that assessment.
 */
export async function putFile(opts: {
  path: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}): Promise<string> {
  if (storageBackend() === "supabase") {
    return uploadObject({ path: opts.path, mimeType: opts.mimeType, data: opts.data });
  }
  const file = await uploadToDrive({
    name: opts.fileName,
    mimeType: opts.mimeType,
    data: opts.data,
  });
  return file.webViewLink ?? "";
}

/**
 * A URL that renders as an image in an <img>/background.
 *
 * A Supabase public link already is the file. A Drive webViewLink is a viewer
 * page and has to be swapped for the thumbnail endpoint.
 */
export function imageUrl(link: string, size = 1200): string | null {
  if (!link) return null;
  if (link.includes("/storage/v1/object/public/")) return link;
  return driveThumbnailUrl(link, size);
}
