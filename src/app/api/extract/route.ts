import { errorResponse, ApiError } from "@/lib/assemblyai";
import { rateLimit } from "@/lib/rate-limit";
import { extractFile } from "@/lib/sources";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request body limit

// Uploaded file -> plain text, so it can become a source like any pasted text.
export async function POST(request: Request) {
  try {
    rateLimit(request, "extract");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ApiError("No file uploaded", 400);
    if (file.size > MAX_BYTES) throw new ApiError("File is larger than 4 MB", 413);

    const text = await extractFile(file);
    if (text.length < 50) throw new ApiError("No readable text found in that file (scanned PDFs are not supported)", 422);
    return Response.json({ name: file.name, text, words: text.split(/\s+/).length });
  } catch (err) {
    return errorResponse(err);
  }
}
