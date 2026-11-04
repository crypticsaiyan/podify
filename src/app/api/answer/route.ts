import { errorResponse, ApiError } from "@/lib/assemblyai";
import type { AnswerRequest, Line } from "@/lib/podcast";
import { rateLimit } from "@/lib/rate-limit";
import { answerQuestion } from "@/lib/writer";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    rateLimit(request, "answer");
    const req = (await request.json()) as AnswerRequest;
    if (!req.question?.trim()) throw new ApiError("Empty question", 400);

    const answer = await answerQuestion(req);
    const stamp = Date.now().toString(36);
    const lines: Line[] = answer.map((l, i) => ({
      id: `a${stamp}${i}`,
      kind: "line",
      speaker: l.speaker,
      text: l.text,
      live: true,
    }));
    return Response.json({ lines });
  } catch (err) {
    return errorResponse(err);
  }
}
