// Server-side wrappers for the AssemblyAI APIs Podify uses:
// LLM Gateway (scripts), Text-to-Speech (voices), Streaming STT tokens (questions).

import { createHash } from "node:crypto";
import { voiceById, type Language } from "./podcast";

const LLM_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
const LLM_MODELS_URL = "https://llm-gateway.assemblyai.com/v1/models";
const TTS_URL = "https://tts.us.assemblyai.com/v1/speech";
const STT_TOKEN_URL = "https://streaming.assemblyai.com/v3/token";

// The free tier only unlocks this model; set LLM_MODEL (e.g. gemini-2.5-flash) once billing is on.
const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3.5-4b-32k-fast";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new ApiError("ASSEMBLYAI_API_KEY is not set", 500);
  return key;
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const json = JSON.parse(body);
    const detail = json.metadata?.errors?.join("; ");
    return detail ?? json.message ?? json.error?.message ?? json.error ?? body;
  } catch {
    return body || res.statusText;
  }
}

let modelParams: Promise<Map<string, string[]>> | null = null;

// Not every gateway model accepts every parameter (small models lack response_format).
async function supports(model: string, param: string): Promise<boolean> {
  modelParams ??= fetch(LLM_MODELS_URL, { headers: { Authorization: apiKey() } })
    .then((res) => res.json())
    .then((data: { data: { id: string; supported_parameters: string[] }[] }) => {
      return new Map(data.data.map((m) => [m.id, m.supported_parameters]));
    })
    .catch(() => {
      modelParams = null;
      return new Map();
    });
  return (await modelParams).get(model)?.includes(param) ?? false;
}

export async function chatJSON<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  example: string; // shape hint for models without response_format; small models copy examples better than schemas
  maxTokens: number;
}): Promise<T> {
  const structured = await supports(LLM_MODEL, "response_format");
  const system = structured
    ? opts.system
    : `${opts.system}\n\nReply with ONLY a JSON object, no prose, no code fences, in exactly this shape:\n${opts.example}`;

  const body = JSON.stringify({
    model: LLM_MODEL,
    max_tokens: opts.maxTokens,
    ...((await supports(LLM_MODEL, "temperature")) ? { temperature: 0.8 } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: opts.user },
    ],
    ...(structured
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
          },
        }
      : {}),
    post_processing_steps: [{ type: "json-repair" }],
  });

  // Free-tier accounts have a low tokens-per-minute cap; wait it out instead of failing.
  // 5xx is retried too: the gateway answers 500 when json-repair can't fix a small model's output.
  let res: Response;
  for (let attempt = 0, serverErrors = 0; ; attempt++) {
    res = await fetch(LLM_URL, {
      method: "POST",
      headers: { Authorization: apiKey(), "Content-Type": "application/json" },
      body,
    });
    if (res.ok) break;
    const message = await errorText(res);
    const rateLimited = res.status === 429 || message.includes("too many tokens");
    const serverError = res.status >= 500 && ++serverErrors <= 2;
    if ((!rateLimited && !serverError) || attempt === 4) throw new ApiError(`LLM Gateway: ${message}`, res.status);
    const wait = rateLimited ? Number(res.headers.get("retry-after")) || 15 : 1;
    await new Promise((r) => setTimeout(r, wait * 1000));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new ApiError("LLM Gateway returned no content", 502);
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    throw new ApiError("The writer returned malformed JSON, try again", 502);
  }
}

// Identical lines are never synthesized twice (replays, re-renders, demos).
const ttsCache = new Map<string, ArrayBuffer>();
const TTS_CACHE_MAX = 500;

export async function synthesize(text: string, voiceId: string, language: Language): Promise<ArrayBuffer> {
  const key = createHash("sha256").update(`${voiceId}|${language}|${text}`).digest("hex");
  const cached = ttsCache.get(key);
  if (cached) return cached;

  const voice = voiceById(voiceId);
  const body = JSON.stringify({
    text: text.slice(0, 5000),
    voice_id: voiceId,
    language,
    // A voice speaking outside its native language needs the multilingual model.
    ...(voice && voice.lang !== language ? { model_id: "assemblyai-tts-1" } : {}),
    encoding: "mp3",
    stream: false,
  });

  // One retry on network failures (connect timeouts, resets); API errors are not retried.
  let res: Response | undefined;
  for (let attempt = 0; !res; attempt++) {
    try {
      res = await fetch(TTS_URL, {
        method: "POST",
        headers: { Authorization: apiKey(), "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (attempt === 1) throw new ApiError(`TTS unreachable: ${err instanceof Error ? err.message : err}`, 503);
    }
  }
  if (!res.ok) throw new ApiError(`TTS: ${await errorText(res)}`, res.status);

  const audio = await res.arrayBuffer();
  if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!);
  ttsCache.set(key, audio);
  return audio;
}

export async function streamingToken(): Promise<string> {
  const res = await fetch(`${STT_TOKEN_URL}?expires_in_seconds=600`, {
    headers: { Authorization: apiKey() },
  });
  if (!res.ok) throw new ApiError(`STT token: ${await errorText(res)}`, res.status);
  const data = await res.json();
  return data.token;
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(err);
  return Response.json({ error: message }, { status });
}
