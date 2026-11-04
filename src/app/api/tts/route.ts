import { errorResponse, synthesize, ApiError } from "@/lib/assemblyai";
import { LANGUAGES, voiceById, type Language } from "@/lib/podcast";
import { rateLimit } from "@/lib/rate-limit";

const MAX_LINE_CHARS = 2000;

export async function POST(request: Request) {
  try {
    rateLimit(request, "tts");
    const { text, voice, language } = (await request.json()) as { text: string; voice: string; language: Language };
    if (!text?.trim() || !voiceById(voice)) throw new ApiError("text and a known voice are required", 400);
    if (text.length > MAX_LINE_CHARS) throw new ApiError("That line is too long", 413);
    if (!LANGUAGES.some((l) => l.id === language)) throw new ApiError("Unsupported language", 400);

    const audio = await synthesize(text, voice, language);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
