// Client-side episode exports. Audio comes from /api/tts (cached server-side), so exporting
// an episode that was already played costs nothing extra.

import { SOURCE_KINDS, voiceById, type Episode, type Line } from "./podcast";

export const EXPORT_FORMATS = [
  { id: "mp3", label: "Audio", ext: "MP3", hint: "Full episode, both voices" },
  { id: "md", label: "Transcript", ext: "Markdown", hint: "Readable script with speakers" },
  { id: "srt", label: "Subtitles", ext: "SRT", hint: "Timed captions for video" },
  { id: "json", label: "Episode data", ext: "JSON", hint: "Everything, incl. live Q&A" },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];

type SpokenLine = Extract<Line, { kind: "line" }>;
export type AudioSource = (line: SpokenLine) => Promise<Blob>;

// TTS returns constant 64 kbps MP3, i.e. 8 bytes per millisecond.
const MP3_BYTES_PER_MS = 8;
const CONCURRENCY = 4;

export function ttsBlob(episode: Pick<Episode, "hosts" | "language">): AudioSource {
  return async (line) => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        voice: episode.hosts[line.speaker === "A" ? 0 : 1],
        language: episode.language,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Voice generation failed");
    return res.blob();
  };
}

async function renderAudio(lines: SpokenLine[], audio: AudioSource, onProgress: (done: number, total: number) => void) {
  const blobs: Blob[] = new Array(lines.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < lines.length) {
      const i = next++;
      blobs[i] = await audio(lines[i]);
      onProgress(++done, lines.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, lines.length) }, worker));
  return blobs;
}

function names(episode: Episode): [string, string] {
  return [voiceById(episode.hosts[0])?.name ?? "Host A", voiceById(episode.hosts[1])?.name ?? "Host B"];
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "podify-episode";
}

function srtTime(ms: number): string {
  const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
  return `${pad(ms / 3_600_000)}:${pad((ms / 60_000) % 60)}:${pad((ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function markdown(episode: Episode, lines: Line[]): string {
  const [a, b] = names(episode);
  const out = [`# ${episode.title}`, "", `_${episode.summary}_`, "", `**Hosts:** ${a} & ${b}`];
  if (episode.sources?.length) {
    out.push("", "**Sources:**");
    for (const s of episode.sources) {
      const kind = SOURCE_KINDS.find((k) => k.id === s.kind)?.label ?? s.kind;
      out.push(`- ${s.label} (${kind})`);
    }
  }
  out.push("", "---", "");
  for (const line of lines) {
    if (line.kind === "question") out.push(`> **Listener:** ${line.text}`, "");
    else out.push(`**${line.speaker === "A" ? a : b}${line.live ? " (live)" : ""}:** ${line.text}`, "");
  }
  out.push("---", "_Made with Podify · AssemblyAI_");
  return out.join("\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportEpisode(
  format: ExportFormat,
  episode: Episode,
  lines: Line[],
  audio: AudioSource,
  onProgress: (done: number, total: number) => void = () => {},
) {
  const name = slug(episode.title);
  const spoken = lines.filter((l): l is SpokenLine => l.kind === "line");

  if (format === "md") return download(new Blob([markdown(episode, lines)], { type: "text/markdown" }), `${name}.md`);
  if (format === "json") {
    const data = { ...episode, lines, exportedAt: new Date().toISOString() };
    return download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${name}.json`);
  }

  // MP3 frames concatenate cleanly, and their byte size gives exact durations for subtitles.
  const blobs = await renderAudio(spoken, audio, onProgress);
  if (format === "mp3") return download(new Blob(blobs, { type: "audio/mpeg" }), `${name}.mp3`);

  const [a, b] = names(episode);
  let t = 0;
  const cues = spoken.map((line, i) => {
    const start = t;
    t += blobs[i].size / MP3_BYTES_PER_MS;
    return `${i + 1}\n${srtTime(start)} --> ${srtTime(t)}\n${line.speaker === "A" ? a : b}: ${line.text}\n`;
  });
  download(new Blob([cues.join("\n")], { type: "application/x-subrip" }), `${name}.srt`);
}
