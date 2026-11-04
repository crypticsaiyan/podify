import { connection } from "next/server";
import { errorResponse, streamingToken } from "@/lib/assemblyai";
import { rateLimit } from "@/lib/rate-limit";

// Short-lived token so the browser can stream mic audio straight to AssemblyAI
// without ever seeing the API key.
export async function GET(request: Request) {
  await connection();
  try {
    rateLimit(request, "sttToken");
    return Response.json({ token: await streamingToken() });
  } catch (err) {
    return errorResponse(err);
  }
}
