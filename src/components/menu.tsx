"use client";

import { Captions, ChevronDown, Download, FileAudio, FileJson, FileText, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXPORT_FORMATS, exportEpisode, type AudioSource, type ExportFormat } from "@/lib/export";
import type { Episode, Line } from "@/lib/podcast";

const FORMAT_ICON: Record<ExportFormat, React.ReactNode> = {
  mp3: <FileAudio />,
  md: <FileText />,
  srt: <Captions />,
  json: <FileJson />,
};

export function ExportMenu({
  episode,
  lines,
  audio,
  align = "end",
  className,
  compact = false,
  onError,
}: {
  episode: Episode;
  lines: Line[];
  audio: AudioSource;
  align?: "start" | "end";
  className?: string;
  compact?: boolean;
  onError: (message: string) => void;
}) {
  const [progress, setProgress] = useState<string | null>(null);

  const run = async (format: ExportFormat) => {
    setProgress("Preparing…");
    try {
      await exportEpisode(format, episode, lines, audio, (done, total) => setProgress(`Rendering ${done}/${total}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setProgress(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon-sm" disabled={progress !== null} aria-label="Export" title={progress ?? "Export"} className={className}>
            {progress ? <LoaderCircle className="animate-spin" /> : <Download />}
          </Button>
        ) : (
          <Button variant="outline" disabled={progress !== null} className={className}>
            {progress ? <LoaderCircle className="animate-spin" /> : <Download />}
            <span className="tabular-nums">{progress ?? "Export"}</span>
            {!progress && <ChevronDown className="text-muted-foreground" />}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        <DropdownMenuLabel>Export episode</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXPORT_FORMATS.map((f) => (
          <DropdownMenuItem key={f.id} onSelect={() => run(f.id)} className="items-start py-1.5">
            <span className="mt-0.5 text-muted-foreground">{FORMAT_ICON[f.id]}</span>
            <span className="flex flex-1 flex-col">
              <span className="flex items-center justify-between">
                {f.label}
                <span className="font-mono text-[10px] text-muted-foreground">{f.ext}</span>
              </span>
              <span className="text-xs text-muted-foreground">{f.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
