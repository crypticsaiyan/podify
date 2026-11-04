"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveTranscriber, prefetchToken } from "@/lib/live-transcriber";
import { LANGUAGES, voiceById, type Episode, type Line } from "@/lib/podcast";
import { AudioLines, LoaderCircle, Mic, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./app-shell";
import { HostAvatar, HostDot } from "./brand";
import { ExportMenu } from "./menu";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Kbd } from "./ui/kbd";
import { Progress } from "./ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type Status = "idle" | "loading" | "playing" | "paused" | "listening" | "thinking" | "ended";
type SpokenLine = Extract<Line, { kind: "line" }>;

const PREFETCH_AHEAD = 3;

// 50 ms of silent 8 kHz WAV. Playing it inside a click "unlocks" the <audio> element, so
// later play() calls that happen after async TTS fetches are not blocked as autoplay (Firefox, Safari).
let silenceUrl: string | null = null;
function silence(): string {
  if (silenceUrl) return silenceUrl;
  const samples = 400;
  const view = new DataView(new ArrayBuffer(44 + samples));
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  new Uint8Array(view.buffer, 44).fill(128);
  silenceUrl = URL.createObjectURL(new Blob([view.buffer], { type: "audio/wav" }));
  return silenceUrl;
}

export function Player({ episode, onLinesChange }: { episode: Episode; onLinesChange?: (lines: Line[]) => void }) {
  const [lines, setLines] = useState<Line[]>(episode.lines);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const linesRef = useRef(lines);
  const indexRef = useRef(0);
  const loadedRef = useRef<string | null>(null); // id of the line currently in the <audio> element
  const runRef = useRef(0); // bumped to cancel any in-flight playIndex
  const cacheRef = useRef(new Map<string, Promise<string>>());
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const resumeAfterAsk = useRef(false);
  const unlocked = useRef(false); // <audio> has played inside a user gesture
  const lineEls = useRef(new Map<string, HTMLElement>());
  const transcriptRef = useRef<HTMLOListElement>(null);

  const names = episode.hosts.map((id) => voiceById(id)?.name ?? id);
  const spokenTotal = lines.filter((l) => l.kind === "line").length;
  const spokenDone = lines.slice(0, current).filter((l) => l.kind === "line").length;

  const updateLines = useCallback(
    (next: Line[]) => {
      linesRef.current = next;
      setLines(next);
      onLinesChange?.(next);
    },
    [onLinesChange],
  );

  const audioFor = useCallback(
    (line: SpokenLine): Promise<string> => {
      const cache = cacheRef.current;
      let url = cache.get(line.id);
      if (!url) {
        url = fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: line.text,
            voice: episode.hosts[line.speaker === "A" ? 0 : 1],
            language: episode.language,
          }),
        }).then(async (res) => {
          if (!res.ok) throw new Error((await res.json()).error ?? "Voice generation failed");
          return URL.createObjectURL(await res.blob());
        });
        url.catch(() => cache.delete(line.id));
        cache.set(line.id, url);
      }
      return url;
    },
    [episode.hosts, episode.language],
  );

  // Exports reuse audio already fetched for playback.
  const exportAudio = useCallback(
    (line: SpokenLine) => audioFor(line).then((url) => fetch(url).then((res) => res.blob())),
    [audioFor],
  );

  const prefetch = useCallback(
    (from: number) => {
      linesRef.current
        .slice(from)
        .filter((l): l is SpokenLine => l.kind === "line")
        .slice(0, PREFETCH_AHEAD)
        .forEach((l) => audioFor(l).catch(() => {}));
    },
    [audioFor],
  );

  const playIndex = useCallback(
    async (start: number) => {
      const run = ++runRef.current;
      const all = linesRef.current;
      let i = start;
      while (i < all.length && all[i].kind !== "line") i++;
      indexRef.current = i;
      setCurrent(i);
      if (i >= all.length) {
        setStatus("ended");
        return;
      }
      const line = all[i] as SpokenLine;
      setStatus("loading");
      setError(null);
      try {
        const url = await audioFor(line);
        if (run !== runRef.current) return;
        const audio = audioRef.current!;
        audio.src = url;
        loadedRef.current = line.id;
        await audio.play();
        if (run !== runRef.current) return;
        setStatus("playing");
        prefetch(i + 1);
      } catch (err) {
        if (run !== runRef.current) return;
        const blocked = err instanceof DOMException && err.name === "NotAllowedError";
        if (blocked) unlocked.current = false;
        setError(blocked ? "Your browser blocked audio. Press play again." : err instanceof Error ? err.message : "Playback failed");
        setStatus("paused");
      }
    },
    [audioFor, prefetch],
  );

  // Must run synchronously inside a user gesture (click, key, pointer).
  const unlock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || unlocked.current) return;
    unlocked.current = true;
    loadedRef.current = null;
    audio.src = silence();
    audio.play().catch((err) => {
      // AbortError just means real audio replaced the silence, which is fine.
      if (err instanceof DOMException && err.name === "NotAllowedError") unlocked.current = false;
    });
  }, []);

  const pause = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    const line = linesRef.current[indexRef.current];
    if (audio && line && loadedRef.current === line.id && !audio.ended) {
      runRef.current++;
      audio.play().then(() => setStatus("playing"), () => playIndex(indexRef.current));
    } else {
      playIndex(indexRef.current);
    }
  }, [playIndex]);

  const togglePlay = () => {
    unlock();
    if (status === "playing" || status === "loading") {
      pause();
      setStatus("paused");
    } else if (status === "ended") {
      playIndex(0);
    } else if (status !== "listening" && status !== "thinking") {
      resume();
    }
  };

  // Push-to-talk: pause the hosts, stream the question to AssemblyAI, splice the answer in.
  const startAsk = useCallback(() => {
    if (transcriberRef.current || status === "thinking") return;
    unlock();
    resumeAfterAsk.current = status === "playing" || status === "loading";
    pause();
    setStatus("listening");
    setHeard("");
    setError(null);
    const transcriber = new LiveTranscriber(setHeard, `Podcast listener question about: ${episode.title}. ${episode.summary}`);
    transcriberRef.current = transcriber;
    transcriber.start().catch((err) => setError(err instanceof Error ? err.message : "Microphone unavailable"));
  }, [status, pause, unlock, episode.title, episode.summary]);

  const endAsk = useCallback(async () => {
    const transcriber = transcriberRef.current;
    if (!transcriber) return;
    transcriberRef.current = null;
    const question = (await transcriber.stop()).trim();
    if (!question) {
      setHeard("");
      setStatus("paused");
      if (resumeAfterAsk.current) resume();
      return;
    }

    setStatus("thinking");
    const all = linesRef.current;
    const at = indexRef.current; // the interrupted line replays after the answer
    const spoken = (l: Line): l is SpokenLine => l.kind === "line";
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: episode.title,
          source: episode.source,
          language: episode.language,
          hosts: episode.hosts,
          history: all.slice(0, at).filter(spoken).map(({ speaker, text }) => ({ speaker, text })),
          next: all.slice(at).find(spoken)?.text ?? null,
          question,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The hosts could not answer");

      const asked: Line = { id: `q${Date.now().toString(36)}`, kind: "question", text: question };
      const answer = data.lines as SpokenLine[];
      updateLines([...all.slice(0, at), asked, ...answer, ...all.slice(at)]);
      setHeard("");
      prefetch(at);
      playIndex(at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The hosts could not answer");
      setStatus("paused");
    }
  }, [episode, playIndex, prefetch, resume, updateLines]);

  // Hold Space anywhere (outside inputs) to cut in.
  const askRef = useRef({ startAsk, endAsk });
  useEffect(() => {
    askRef.current = { startAsk, endAsk };
  });
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e)) return;
      e.preventDefault();
      askRef.current.startAsk();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      askRef.current.endAsk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    prefetch(0);
    prefetchToken().catch(() => {});
    const cache = cacheRef.current;
    return () => {
      pause();
      // Clear too: React dev mode remounts, and a remount must not reuse revoked URLs.
      cache.forEach((p) => p.then(URL.revokeObjectURL, () => {}));
      cache.clear();
    };
  }, [prefetch, pause]);

  useEffect(() => {
    // Scroll only the transcript panel, never the page, so the stage stays in view.
    const line = lines[current];
    const el = line && lineEls.current.get(line.id);
    const list = transcriptRef.current;
    if (el && list) list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [current, lines]);

  const busy = status === "listening" || status === "thinking";
  const onAir = status === "playing" || status === "loading";
  const currentLine = lines[current];
  const speakingHost = onAir && currentLine?.kind === "line" ? (currentLine.speaker === "A" ? 0 : 1) : null;
  const language = LANGUAGES.find((l) => l.id === episode.language)?.label;
  const jump = (i: number) => {
    if (busy) return;
    unlock();
    playIndex(i);
  };
  const statusText: Record<Status, string> = {
    idle: "Ready",
    loading: "Loading voice…",
    playing: "Playing",
    paused: "Paused",
    listening: "Listening",
    thinking: "Writing an answer…",
    ended: "Finished",
  };

  // Rendered in the stage card on desktop and in a fixed bottom bar on phones.
  const controls = (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-lg" onClick={() => jump(0)} disabled={busy} aria-label="Restart">
            <RotateCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Restart</TooltipContent>
      </Tooltip>
      <Button size="lg" onClick={togglePlay} disabled={busy} className="min-w-24">
        {onAir ? <Pause /> : <Play />}
        {onAir ? "Pause" : status === "ended" ? "Replay" : "Play"}
      </Button>
      <Button
        variant={status === "listening" ? "destructive" : "outline"}
        size="lg"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startAsk();
        }}
        onPointerUp={endAsk}
        onPointerCancel={endAsk}
        onContextMenu={(e) => e.preventDefault()}
        disabled={status === "thinking"}
        className="ml-auto touch-none select-none"
      >
        <Mic />
        {status === "listening" ? "Release to ask" : "Hold to ask"}
        <Kbd className="ml-1 hidden sm:inline-flex">Space</Kbd>
      </Button>
    </div>
  );

  return (
    <div className="flex h-svh flex-col">
      <audio ref={audioRef} onEnded={() => loadedRef.current && playIndex(indexRef.current + 1)} hidden />
      <PageHeader title={episode.title}>
        <ExportMenu episode={episode} lines={lines} audio={exportAudio} onError={setError} />
      </PageHeader>

      <Tabs
        defaultValue="now"
        className="flex min-h-0 flex-1 flex-col gap-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-4 lg:p-4"
      >
        <TabsList className="mx-3 mt-3 w-auto lg:hidden">
          <TabsTrigger value="now">Now playing</TabsTrigger>
          <TabsTrigger value="transcript">
            Transcript <span className="font-mono text-xs text-muted-foreground">{spokenTotal}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="now"
          forceMount
          className="min-h-0 overflow-y-auto p-3 data-[state=inactive]:hidden lg:p-0 lg:data-[state=inactive]:block"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {status === "listening" ? (
                  <Mic className="size-4 text-destructive" />
                ) : onAir ? (
                  <AudioLines className="size-4 animate-pulse" />
                ) : null}
                {statusText[status]}
              </CardTitle>
              <CardAction>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {String(Math.min(spokenDone + 1, spokenTotal)).padStart(2, "0")} / {String(spokenTotal).padStart(2, "0")}
                </span>
              </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              <div className="flex items-center gap-5">
                {names.map((name, i) => {
                  const host = i as 0 | 1;
                  return (
                    <div
                      key={name + i}
                      className={cn(
                        "flex items-center gap-2 transition-opacity",
                        speakingHost !== null && speakingHost !== host && "opacity-40",
                      )}
                    >
                      <HostAvatar name={name} host={host} active={speakingHost === host} />
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                  );
                })}
              </div>

              <div className="min-h-28" aria-live="polite">
                {status === "listening" || status === "thinking" ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Your question</span>
                    <p className="text-lg leading-relaxed">{heard || <span className="text-muted-foreground">Listening…</span>}</p>
                    {status === "thinking" && (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" /> The hosts are working out an answer
                      </span>
                    )}
                  </div>
                ) : status === "ended" ? (
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    That&apos;s the end of the episode. Ask a follow-up question or play it again.
                  </p>
                ) : currentLine?.kind === "line" ? (
                  <div className="flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <HostDot host={currentLine.speaker === "A" ? 0 : 1} />
                      {names[currentLine.speaker === "A" ? 0 : 1]}
                      {currentLine.live && <Badge variant="secondary">Answer</Badge>}
                    </span>
                    <p className={cn("text-lg leading-relaxed text-pretty", !onAir && "text-muted-foreground")}>
                      {currentLine.text}
                    </p>
                  </div>
                ) : null}
              </div>

              <Progress value={spokenTotal ? (spokenDone / spokenTotal) * 100 : 0} />
              <div className="hidden lg:block">{controls}</div>

              {error && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex-col items-start gap-2 border-t">
              <p className="text-sm text-muted-foreground text-pretty">{episode.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{language}</Badge>
                <Badge variant="outline">
                  {names[0]} &amp; {names[1]}
                </Badge>
                {episode.sources && episode.sources.length > 1 && (
                  <Badge variant="outline">{episode.sources.length} sources</Badge>
                )}
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent
          value="transcript"
          forceMount
          className="flex min-h-0 flex-col p-3 data-[state=inactive]:hidden lg:p-0 lg:data-[state=inactive]:flex"
        >
          <Card className="min-h-0 flex-1 gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm">Transcript</CardTitle>
              <CardAction className="text-xs text-muted-foreground">Tap a line to jump</CardAction>
            </CardHeader>
            <ol ref={transcriptRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto p-2 [scrollbar-width:thin]">
              {lines.map((line, i) => {
                const register = (el: HTMLElement | null) =>
                  void (el ? lineEls.current.set(line.id, el) : lineEls.current.delete(line.id));
                if (line.kind === "question") {
                  return (
                    <li key={line.id} ref={register} className="my-1 flex gap-3 rounded-md border border-dashed px-3 py-2.5">
                      <Mic className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-muted-foreground">You asked</span>
                        <p className="text-sm">{line.text}</p>
                      </div>
                    </li>
                  );
                }
                const host = line.speaker === "A" ? 0 : 1;
                const active = i === current && status !== "ended";
                return (
                  <li key={line.id} ref={register}>
                    <button
                      type="button"
                      onClick={() => jump(i)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2",
                        active && "bg-muted hover:bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <HostDot host={host} />
                        {names[host]}
                        {line.live && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            Answer
                          </Badge>
                        )}
                      </span>
                      <span className={cn("text-sm leading-relaxed text-pretty", active ? "text-foreground" : "text-muted-foreground")}>
                        {line.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="shrink-0 border-t bg-background p-3 lg:hidden">{controls}</div>
    </div>
  );
}
