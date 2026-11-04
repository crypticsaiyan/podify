// Shared types and constants used by both the API routes and the client.

export const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "spanish", label: "Spanish" },
  { id: "french", label: "French" },
  { id: "german", label: "German" },
  { id: "italian", label: "Italian" },
  { id: "portuguese", label: "Portuguese" },
] as const;

export type Language = (typeof LANGUAGES)[number]["id"];

export type Voice = { id: string; name: string; lang: Language };

// Library voices from the AssemblyAI docs. Every voice can speak all six
// languages through the multilingual model, native ones just sound best.
export const VOICES: Voice[] = [
  { id: "aai-sara", name: "Sara", lang: "english" },
  { id: "aai-george", name: "George", lang: "english" },
  { id: "aai-jane", name: "Jane", lang: "english" },
  { id: "aai-michael", name: "Michael", lang: "english" },
  { id: "aai-mary", name: "Mary", lang: "english" },
  { id: "aai-paul", name: "Paul", lang: "english" },
  { id: "aai-eve", name: "Eve", lang: "english" },
  { id: "aai-charles", name: "Charles", lang: "english" },
  { id: "aai-anna", name: "Anna", lang: "english" },
  { id: "aai-vera", name: "Vera", lang: "english" },
  { id: "aai-audrey", name: "Audrey", lang: "english" },
  { id: "aai-constanza", name: "Constanza", lang: "spanish" },
  { id: "aai-donatien", name: "Donatien", lang: "french" },
  { id: "aai-gunther", name: "Günther", lang: "german" },
  { id: "aai-benicio", name: "Benício", lang: "portuguese" },
];

export function voiceById(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}

// Prefer a native voice for the first host so the episode sounds local.
export function defaultHosts(language: Language): [string, string] {
  const native = VOICES.find((v) => v.lang === language && language !== "english");
  return native ? [native.id, "aai-george"] : ["aai-sara", "aai-george"];
}

export const LENGTHS = [
  { id: "short", label: "~2 min", words: 350 },
  { id: "medium", label: "~5 min", words: 800 },
  { id: "long", label: "~10 min", words: 1500 },
] as const;

export type Length = (typeof LENGTHS)[number]["id"];

export const STYLES = [
  { id: "casual", label: "Casual chat", prompt: "Relaxed and friendly, like two smart friends talking over coffee." },
  { id: "deep", label: "Deep dive", prompt: "Thorough and technical. Go into the how and why, define jargon briefly." },
  { id: "debate", label: "Debate", prompt: "Host B plays skeptic and pushes back hard; Host A defends with evidence from the source." },
  { id: "eli5", label: "Explain like I'm 5", prompt: "Very simple words, everyday analogies, zero jargon." },
] as const;

export type Style = (typeof STYLES)[number]["id"];

export type Speaker = "A" | "B";

export type Line =
  | { id: string; kind: "line"; speaker: Speaker; text: string; live?: boolean }
  | { id: string; kind: "question"; text: string };

export const SOURCE_KINDS = [
  { id: "link", label: "Link", hint: "Article, docs page, paper" },
  { id: "github", label: "GitHub repo", hint: "README, files and metadata" },
  { id: "text", label: "Paste text", hint: "Notes, an email, anything" },
  { id: "file", label: "Upload file", hint: "PDF, TXT or Markdown" },
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number]["id"];

// What the client sends: URLs for link/github, raw text for text/file (files are extracted first).
export type SourceInput = { kind: SourceKind; value: string; label: string };

export type Episode = {
  title: string;
  summary: string;
  language: Language;
  hosts: [string, string];
  source: string; // combined source text, reused to answer listener questions
  sources?: { kind: SourceKind; label: string }[];
  lines: Line[];
};

export type EpisodeRequest = {
  sources: SourceInput[];
  language: Language;
  length: Length;
  style: Style;
  hosts: [string, string];
};

export type AnswerRequest = {
  title: string;
  source: string;
  language: Language;
  hosts: [string, string];
  history: { speaker: Speaker; text: string }[];
  next: string | null;
  question: string;
};
