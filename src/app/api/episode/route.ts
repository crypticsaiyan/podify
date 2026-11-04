import { errorResponse, ApiError } from "@/lib/assemblyai";
import { LANGUAGES, type Episode, type EpisodeRequest } from "@/lib/podcast";
import { rateLimit } from "@/lib/rate-limit";
import { loadSources } from "@/lib/sources";
import { writeEpisode } from "@/lib/writer";

export const maxDuration = 120;

const MAX_SOURCES = 8;

export async function POST(request: Request) {
  try {
    rateLimit(request, "episode");
    const req = (await request.json()) as EpisodeRequest;
    const sources = (req.sources ?? []).filter((s) => s.value?.trim());
    if (sources.length === 0) throw new ApiError("Add at least one source first", 400);
    if (sources.length > MAX_SOURCES) throw new ApiError(`Use at most ${MAX_SOURCES} sources`, 400);
    if (!LANGUAGES.some((l) => l.id === req.language)) throw new ApiError("Unsupported language", 400);

    const source = await loadSources(sources);
    const script = await writeEpisode(req, source, sources.length);

    const episode: Episode = {
      title: script.title,
      summary: script.summary,
      language: req.language,
      hosts: req.hosts,
      source,
      sources: sources.map(({ kind, label }) => ({ kind, label })),
      lines: script.lines.map((l, i) => ({ id: `l${i}`, kind: "line", speaker: l.speaker, text: l.text })),
    };
    return Response.json(episode);
  } catch (err) {
    return errorResponse(err);
  }
}
