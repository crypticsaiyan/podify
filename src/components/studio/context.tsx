"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { library, type Run } from "@/lib/library";
import {
  defaultHosts,
  type Episode,
  type Language,
  type Length,
  type SourceInput,
  type SourceKind,
  type Style,
} from "@/lib/podcast";

export type DraftSource = {
  id: string;
  kind: SourceKind;
  value: string; // URL for link/github, text for text/file
  name?: string; // uploaded file name
  status: "idle" | "extracting" | "ready" | "error";
  meta?: string;
  error?: string;
};

const PREVIEW_LINES: Record<Language, string> = {
  english: "Hey, welcome back to the show. Let's dig in.",
  spanish: "Hola, bienvenidos de nuevo al programa. Vamos a ello.",
  french: "Salut, bon retour dans l'émission. On y va.",
  german: "Hallo und willkommen zurück in der Show. Legen wir los.",
  italian: "Ciao, bentornati nello show. Cominciamo.",
  portuguese: "Olá, bem-vindos de volta ao programa. Vamos lá.",
};

// Rough timings of the single /api/episode call, shown as progress.
const STAGES = [
  { at: 0, label: "Reading sources" },
  { at: 4, label: "Writing the script" },
  { at: 14, label: "Rehearsing with the hosts" },
];

const INITIAL_ID = "s-initial";
let counter = 0;
const newId = () => `s${Date.now().toString(36)}${counter++}`;

export function sourceLabel(s: DraftSource): string {
  if (s.kind === "file") return s.name ?? "Uploaded file";
  if (s.kind === "text") {
    const text = s.value.trim().replace(/\s+/g, " ");
    return text.length > 40 ? `“${text.slice(0, 40)}…”` : `“${text}”`;
  }
  try {
    const url = new URL(s.value.trim());
    const path = url.pathname.replace(/\/$/, "");
    return s.kind === "github" ? path.slice(1) : `${url.hostname.replace(/^www\./, "")}${path.length > 1 ? path.slice(0, 32) : ""}`;
  } catch {
    return s.value.trim();
  }
}

function validate(s: DraftSource, n: number): string | null {
  if (s.kind === "link" && !/^https?:\/\/\S+\.\S+/i.test(s.value.trim())) return `Source ${n}: that doesn't look like a link`;
  if (s.kind === "github" && !/^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(s.value.trim()))
    return `Source ${n}: use a github.com/owner/repo link`;
  return null;
}

function useStudioState(openFilePicker: () => void) {
  const [sources, setSources] = useState<DraftSource[]>([{ id: INITIAL_ID, kind: "link", value: "", status: "idle" }]);
  const [language, setLanguageState] = useState<Language>("english");
  const [length, setLength] = useState<Length>("short");
  const [style, setStyle] = useState<Style>("casual");
  const [hosts, setHosts] = useState<[string, string]>(defaultHosts("english"));
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const router = useRouter();
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, [loading]);

  const update = (id: string, patch: Partial<DraftSource>) =>
    setSources((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // The empty starter card goes away once something else is added; cards the user added stay.
  const withoutEmpty = (all: DraftSource[]) => all.filter((s) => s.id !== INITIAL_ID || s.value.trim());

  const addSource = (kind: SourceKind) => {
    if (kind === "file") return openFilePicker();
    setSources((all) => [...withoutEmpty(all), { id: newId(), kind, value: "", status: "idle" }]);
  };

  const addFiles = (files: File[]) => {
    const drafts: DraftSource[] = files.map((f) => ({ id: newId(), kind: "file", value: "", name: f.name, status: "extracting" }));
    setSources((all) => [...withoutEmpty(all), ...drafts]);
    drafts.forEach(async (draft, i) => {
      try {
        const form = new FormData();
        form.append("file", files[i]);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not read that file");
        update(draft.id, { value: data.text, status: "ready", meta: `${data.words.toLocaleString()} words` });
      } catch (err) {
        update(draft.id, { status: "error", error: err instanceof Error ? err.message : "Could not read that file" });
      }
    });
  };

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    setHosts(defaultHosts(next));
  };

  const preview = async (voice: string) => {
    previewAudio.current?.pause();
    if (previewing === voice) return setPreviewing(null);
    setPreviewing(voice);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: PREVIEW_LINES[language], voice, language }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Preview failed");
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.onended = () => setPreviewing((v) => (v === voice ? null : v));
      previewAudio.current = audio;
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setPreviewing(null);
    }
  };

  const generate = async () => {
    setError(null);
    if (sources.some((s) => s.status === "extracting")) return setError("Wait for your files to finish reading");
    const ready = sources.filter((s) => s.value.trim() && s.status !== "error");
    if (ready.length === 0) return setError("Add at least one source first");
    const invalid = ready.map((s) => validate(s, sources.indexOf(s) + 1)).find(Boolean);
    if (invalid) return setError(invalid);

    previewAudio.current?.pause();
    setPreviewing(null);
    setElapsed(0);
    setLoading(true);
    const started = Date.now();
    const payload: SourceInput[] = ready.map((s) => ({ kind: s.kind, value: s.value, label: sourceLabel(s) }));
    const settings = { language, length, style, hosts };
    // Every attempt lands in the library, failures included, so it can be retried from there.
    try {
      const res = await fetch("/api/episode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: payload, ...settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const id = library.add({ status: "ready", settings, sources: payload, episode: data as Episode, generationMs: Date.now() - started });
      setLastRunId(id);
      router.push(`/episode/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      library.add({ status: "failed", settings, sources: payload, error: message, generationMs: Date.now() - started });
    } finally {
      setLoading(false);
    }
  };

  // Puts a past run's sources and settings back into the studio to tweak and regenerate.
  const remix = (run: Run) => {
    setSources(
      run.sources.map((s) => ({
        id: newId(),
        kind: s.kind,
        value: s.value,
        name: s.kind === "file" ? s.label : undefined,
        status: s.kind === "file" ? "ready" : "idle",
        meta: s.kind === "file" ? `${s.value.split(/\s+/).length.toLocaleString()} words` : undefined,
      })),
    );
    setLanguageState(run.settings.language);
    setLength(run.settings.length);
    setStyle(run.settings.style);
    setHosts(run.settings.hosts);
    setError(null);
    router.push("/");
  };

  // Example chips fill the first empty link card, or add a new one.
  const addExample = (url: string) =>
    setSources((all) => {
      const empty = all.find((s) => s.kind === "link" && !s.value.trim());
      if (empty) return all.map((s) => (s === empty ? { ...s, value: url } : s));
      const kind = url.includes("github.com") ? "github" : "link";
      return [...withoutEmpty(all), { id: newId(), kind, value: url, status: "idle" }];
    });

  const stage = STAGES.findLast((s) => elapsed >= s.at) ?? STAGES[0];
  return {
    sources,
    addSource,
    addFiles,
    updateSource: (id: string, value: string) => update(id, { value }),
    removeSource: (id: string) => setSources((all) => all.filter((s) => s.id !== id)),
    language,
    setLanguage,
    length,
    setLength,
    style,
    setStyle,
    hosts,
    setHost: (i: 0 | 1, voice: string) => setHosts((h) => (i === 0 ? [voice, h[1]] : [h[0], voice])),
    previewing,
    preview,
    loading,
    stageLabel: stage.label,
    progress: Math.min(95, (1 - Math.exp(-elapsed / 10)) * 100),
    error,
    setError,
    lastRunId,
    generate,
    remix,
    addExample,
  };
}

type StudioState = ReturnType<typeof useStudioState>;
const StudioContext = createContext<StudioState | null>(null);

export function useStudio(): StudioState {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const state = useStudioState(() => fileInput.current?.click());
  return (
    <StudioContext.Provider value={state}>
      {children}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        onChange={(e) => {
          state.addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </StudioContext.Provider>
  );
}
