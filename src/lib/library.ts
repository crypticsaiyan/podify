// Past runs, kept in this browser's localStorage. There is no server-side database: a run is
// visible only on the device that generated it.

import { useSyncExternalStore } from "react";
import type { Episode, Language, Length, SourceInput, Style } from "./podcast";

export type Run = {
  id: string;
  createdAt: number;
  status: "ready" | "failed";
  settings: { language: Language; length: Length; style: Style; hosts: [string, string] };
  sources: SourceInput[];
  episode?: Episode;
  error?: string;
  generationMs: number;
};

const KEY = "podify:runs:v1";
const EVENT = "podify:runs";
const MAX_RUNS = 30;
const MAX_STORED_SOURCE = 30_000; // per source value, enough to remix the run later

let cache: { raw: string | null; runs: Run[] } = { raw: null, runs: [] };

function read(): Run[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, runs: raw ? (JSON.parse(raw) as Run[]) : [] };
  } catch {
    // Private mode or corrupted data: keep whatever was last readable.
  }
  return cache.runs;
}

function write(runs: Run[]) {
  // On quota errors, drop the oldest runs until it fits.
  for (let list = runs.slice(0, MAX_RUNS); list.length > 0; list = list.slice(0, -1)) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      break;
    } catch {
      continue;
    }
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** All runs, newest first. `null` until the browser storage has been read (server render, hydration). */
export function useRuns(): Run[] | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export const library = {
  add(run: Omit<Run, "id" | "createdAt">): string {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const sources = run.sources.map((s) => ({ ...s, value: s.value.slice(0, MAX_STORED_SOURCE) }));
    write([{ ...run, sources, id, createdAt: Date.now() }, ...read()]);
    return id;
  },
  update(id: string, patch: Partial<Run>) {
    write(read().map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  remove(id: string) {
    write(read().filter((r) => r.id !== id));
  },
};

export function listeningMinutes(episode: Episode): number {
  const words = episode.lines.reduce((n, l) => n + (l.kind === "line" ? l.text.split(/\s+/).length : 0), 0);
  return words / 150;
}

export function questionCount(episode: Episode): number {
  return episode.lines.filter((l) => l.kind === "question").length;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((ms - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}
