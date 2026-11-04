// Turns source material into podcast dialogue, and answers listener questions mid-episode.

import { chatJSON, ApiError } from "./assemblyai";
import {
  LANGUAGES,
  LENGTHS,
  STYLES,
  voiceById,
  type AnswerRequest,
  type EpisodeRequest,
  type Speaker,
} from "./podcast";

function hostNames(hosts: [string, string]): [string, string] {
  return [voiceById(hosts[0])?.name ?? "Alex", voiceById(hosts[1])?.name ?? "Sam"];
}

// Small models mix up who is speaking; spelling it out stops hosts naming or addressing themselves.
function speakerRules(a: string, b: string): string {
  return `
- Lines with speaker "A" are spoken by ${a}; lines with speaker "B" are spoken by ${b}.
- A speaker never says their own name except to introduce themselves ("I'm ${a}"). ${a} addresses the co-host as "${b}", and ${b} addresses the co-host as "${a}".`;
}

function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "English";
}

const SPOKEN_RULES = `
- This is audio only. Write exactly what is spoken: no stage directions, no markdown, no emojis, no sound effects, no speaker labels inside the text.
- Natural spoken language: contractions, short sentences, quick reactions ("Wait, really?", "Okay, that's wild."). Hosts call each other by name now and then.
- Say numbers, symbols and abbreviations the way a person would read them aloud. Never read out URLs or code verbatim; describe them.
- Stick to facts in the source. If something is not in the source, do not invent it.`;

type Dialogue = { speaker: Speaker; text: string };

const lineSchema = {
  type: "object",
  properties: {
    speaker: { type: "string", enum: ["A", "B"] },
    text: { type: "string" },
  },
  required: ["speaker", "text"],
  additionalProperties: false,
};

export async function writeEpisode(req: EpisodeRequest, source: string, sourceCount = 1) {
  const [a, b] = hostNames(req.hosts);
  const length = LENGTHS.find((l) => l.id === req.length) ?? LENGTHS[0];
  const style = STYLES.find((s) => s.id === req.style) ?? STYLES[0];

  const system = `You are the head writer of Podify, a show that turns any source into a two-host podcast episode.
Host A is ${a}, the lead who knows the material and guides the conversation.
Host B is ${b}, the sharp co-host who asks the questions a curious listener would ask.
Tone: ${style.prompt}

Rules:${SPOKEN_RULES}${speakerRules(a, b)}
- Open with a hook about why this matters, not a generic welcome.
- Each line is 1 to 4 sentences. Alternate speakers naturally; occasional back-to-back short lines are fine.
- End with a crisp takeaway and a short sign-off.${
    sourceCount > 1
      ? `\n- There are ${sourceCount} sources. Cover each one, connect them, and point out where they agree or differ. Mention a source by name when it helps.`
      : ""
  }
- Target about ${length.words} words total.
- Write everything (title, summary, dialogue) in ${languageLabel(req.language)}.`;

  const result = await chatJSON<{ title: string; summary: string; lines: Dialogue[] }>({
    system,
    user: `Source material:\n\n${source}`,
    schemaName: "episode",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Catchy episode title, under 60 characters" },
        summary: { type: "string", description: "One or two sentence episode description" },
        lines: { type: "array", items: lineSchema },
      },
      required: ["title", "summary", "lines"],
      additionalProperties: false,
    },
    example: `{"title": "...", "summary": "...", "lines": [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}, {"speaker": "A", "text": "..."}]}`,
    // Non-English text and JSON overhead cost more tokens per word than English prose.
    maxTokens: Math.round(length.words * 4) + 600,
  });

  const lines = (Array.isArray(result.lines) ? result.lines : []).filter((l) => l.text?.trim());
  // If the model ran out of tokens, json-repair closes the JSON mid-sentence: drop that last line.
  if (lines.length > 2 && !/[.!?…"'»”)]$/.test(lines.at(-1)!.text.trim())) lines.pop();
  if (lines.length < 2) throw new ApiError("The writer returned an empty script, try again", 502);
  return { title: result.title, summary: result.summary, lines };
}

export async function answerQuestion(req: AnswerRequest) {
  const [a, b] = hostNames(req.hosts);
  const recent = req.history
    .slice(-12)
    .map((l) => `${l.speaker === "A" ? a : b}: ${l.text}`)
    .join("\n");

  const system = `You write live dialogue for Podify, a two-host podcast. Host A is ${a}, host B is ${b}.
A listener just cut in mid-episode with a spoken question. The hosts react live, answer, then pick the episode back up.

Rules:${SPOKEN_RULES}${speakerRules(a, b)}
- The first line has speaker "B": ${b} speaks to ${a}, starting with "${a}," and says what the listener just asked. Do not start it with "${b}".
- The second line has speaker "A": ${a} starts answering.
- Answer directly and accurately using the source. If the source does not cover it, say so honestly and give the best related point it does make.
- 2 to 5 lines, under 130 words total. Keep it snappy.
- The last line is a short, new transition back to the show, like "Anyway, back to where we were." Never repeat or reword the upcoming line given below; it is played right after your lines.
- The question may contain speech-to-text errors; infer the intended meaning.
- Write in ${languageLabel(req.language)}.`;

  const user = `Episode: ${req.title}

Source material:
${req.source.slice(0, 12_000)}

Conversation so far (most recent last):
${recent || "(the episode just started)"}

Upcoming line after the interruption:
${req.next ?? "(this was the end of the episode, wrap up again briefly)"}

Listener's question: "${req.question}"`;

  const result = await chatJSON<{ lines: Dialogue[] }>({
    system,
    user,
    schemaName: "answer",
    schema: {
      type: "object",
      properties: { lines: { type: "array", items: lineSchema } },
      required: ["lines"],
      additionalProperties: false,
    },
    example: `{"lines": [{"speaker": "B", "text": "..."}, {"speaker": "A", "text": "..."}]}`,
    maxTokens: 700,
  });
  // Small models sometimes copy the upcoming line, which would then play twice in a row.
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const upcoming = normalize(req.next ?? "");
  return (Array.isArray(result.lines) ? result.lines : []).filter((l) => l.text?.trim() && normalize(l.text) !== upcoming);
}
