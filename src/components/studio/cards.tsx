"use client";

import {
  ChevronDown,
  FileText,
  FileUp,
  FolderGit2,
  Link2,
  LoaderCircle,
  PenLine,
  Play,
  Plus,
  Podcast,
  RotateCcw,
  Square,
  TriangleAlert,
  Type,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { HostAvatar } from "@/components/brand";
import { ExportMenu } from "@/components/menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ttsBlob } from "@/lib/export";
import { useRuns } from "@/lib/library";
import { LANGUAGES, LENGTHS, SOURCE_KINDS, STYLES, VOICES, voiceById, type SourceKind } from "@/lib/podcast";
import { cn } from "@/lib/utils";
import { sourceLabel, useStudio } from "./context";

export const KIND_ICON: Record<SourceKind, LucideIcon> = {
  link: Link2,
  github: FolderGit2,
  text: Type,
  file: FileText,
};

export const EXAMPLES = [
  { label: "Octopus", detail: "Wikipedia", value: "https://en.wikipedia.org/wiki/Octopus" },
  { label: "How to Do Great Work", detail: "Paul Graham", value: "https://paulgraham.com/greatwork.html" },
  { label: "Attention Is All You Need", detail: "arXiv", value: "https://arxiv.org/abs/1706.03762" },
  { label: "huggingface/transformers", detail: "GitHub", value: "https://github.com/huggingface/transformers" },
];

export function AddSourceMenu({ className }: { className?: string }) {
  const { addSource, addExample, loading } = useStudio();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={loading} className={className}>
          <Plus /> Add source <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Source type</DropdownMenuLabel>
        {SOURCE_KINDS.map((k) => {
          const Icon = k.id === "file" ? FileUp : KIND_ICON[k.id];
          return (
            <DropdownMenuItem key={k.id} onSelect={() => addSource(k.id)} className="items-start py-1.5">
              <Icon className="mt-0.5 text-muted-foreground" />
              <span className="flex flex-col">
                {k.label}
                <span className="text-xs text-muted-foreground">{k.hint}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Examples</DropdownMenuLabel>
        {EXAMPLES.map((ex) => (
          <DropdownMenuItem key={ex.value} onSelect={() => addExample(ex.value)}>
            <span className="truncate">{ex.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{ex.detail}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("w-full shadow-sm", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function SourceCard({ id }: { id: string }) {
  const { sources, updateSource, removeSource, loading } = useStudio();
  const index = sources.findIndex((s) => s.id === id);
  const source = sources[index];
  if (!source) return null;
  const kind = SOURCE_KINDS.find((k) => k.id === source.kind)!;
  const inputId = `source-${id}`;

  return (
    <NodeCard
      icon={KIND_ICON[source.kind]}
      title={kind.label}
      description={`Source ${index + 1}`}
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => removeSource(id)}
              disabled={loading}
              aria-label="Remove source"
              className="nodrag"
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      }
    >
      {source.kind === "link" || source.kind === "github" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId} className="sr-only">
            URL
          </Label>
          <Input
            id={inputId}
            type="url"
            value={source.value}
            disabled={loading}
            onChange={(e) => updateSource(id, e.target.value)}
            placeholder={source.kind === "github" ? "https://github.com/owner/repo" : "https://"}
            className="nodrag"
          />
          {source.value.trim() && <span className="truncate text-xs text-muted-foreground">{sourceLabel(source)}</span>}
        </div>
      ) : source.kind === "text" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId} className="sr-only">
            Text
          </Label>
          <Textarea
            id={inputId}
            value={source.value}
            disabled={loading}
            onChange={(e) => updateSource(id, e.target.value)}
            placeholder="Paste notes, an article, an email…"
            rows={5}
            className="nodrag nowheel min-h-28 max-h-48 resize-none"
          />
          {source.value.trim() && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {source.value.trim().split(/\s+/).length.toLocaleString()} words
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5">
          {source.status === "extracting" ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : source.status === "error" ? (
            <TriangleAlert className="size-4 shrink-0 text-destructive" />
          ) : (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{source.name}</span>
            <span className={cn("text-xs", source.status === "error" ? "text-destructive" : "text-muted-foreground")}>
              {source.status === "extracting" ? "Reading file…" : source.status === "error" ? source.error : source.meta}
            </span>
          </span>
        </div>
      )}
    </NodeCard>
  );
}

export function ScriptCard() {
  const { language, setLanguage, length, setLength, style, setStyle, loading } = useStudio();
  return (
    <NodeCard icon={PenLine} title="Script" description="Written by AssemblyAI LLM Gateway">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Language</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)} disabled={loading}>
            <SelectTrigger className="nodrag w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Style</Label>
          <Select value={style} onValueChange={(v) => setStyle(v as typeof style)} disabled={loading}>
            <SelectTrigger className="nodrag w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Length</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={length}
          onValueChange={(v) => v && setLength(v as typeof length)}
          disabled={loading}
          className="nodrag w-full"
        >
          {LENGTHS.map((l) => (
            <ToggleGroupItem key={l.id} value={l.id} className="flex-1 data-[state=on]:bg-secondary data-[state=on]:text-foreground">
              {l.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </NodeCard>
  );
}

export function HostsCard() {
  const { hosts, setHost, language, previewing, preview, loading } = useStudio();
  return (
    <NodeCard icon={Volume2} title="Voices" description="AssemblyAI Text-to-Speech">
      {(["Lead host", "Co-host"] as const).map((role, i) => {
        const host = i as 0 | 1;
        const voice = hosts[host];
        return (
          <div key={role} className="flex items-end gap-2">
            <HostAvatar name={voiceById(voice)?.name ?? "?"} host={host} className="mb-0.5" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label>{role}</Label>
              <Select value={voice} onValueChange={(v) => setHost(host, v)} disabled={loading}>
                <SelectTrigger className="nodrag w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={v.id === hosts[1 - host]}>
                      {v.name}
                      {v.lang !== language && <span className="text-muted-foreground capitalize">{v.lang}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => preview(voice)}
                  aria-label={`Preview ${role} voice`}
                  className="nodrag"
                >
                  {previewing === voice ? <Square className="size-3" /> : <Volume2 />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{previewing === voice ? "Stop" : "Preview voice"}</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </NodeCard>
  );
}

function useSummary() {
  const { sources, language, length, style } = useStudio();
  const filled = sources.filter((s) => s.value.trim()).length;
  return [
    `${filled} source${filled === 1 ? "" : "s"}`,
    LANGUAGES.find((l) => l.id === language)?.label,
    LENGTHS.find((l) => l.id === length)?.label,
    STYLES.find((s) => s.id === style)?.label,
  ];
}

function useLastRun() {
  const { lastRunId } = useStudio();
  const runs = useRuns();
  return runs?.find((r) => r.id === lastRunId && r.episode);
}

export function EpisodeCard() {
  const { loading, stageLabel, progress, error, setError, generate } = useStudio();
  const summary = useSummary();
  const last = useLastRun();

  return (
    <NodeCard icon={Podcast} title="Episode" description="Ask questions while it plays">
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>{stageLabel}…</span>
            <span className="font-mono text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {summary.map((s, i) => (
              <li key={i} className="after:ml-2 after:content-['·'] last:after:content-none">
                {s}
              </li>
            ))}
          </ul>
          <Button size="lg" onClick={generate} className="nodrag">
            {last ? <RotateCcw /> : null}
            {last ? "Generate again" : "Generate episode"}
          </Button>
        </div>
      )}
      {last?.episode && !loading && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Last episode</span>
          <span className="line-clamp-2 text-sm font-medium leading-snug">{last.episode.title}</span>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="secondary" className="nodrag">
              <Link href={`/episode/${last.id}`}>
                <Play /> Open
              </Link>
            </Button>
            <ExportMenu episode={last.episode} lines={last.episode.lines} audio={ttsBlob(last.episode)} align="start" onError={setError} className="nodrag" />
          </div>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </NodeCard>
  );
}

// Phone layout: the Episode node collapses into a bar pinned under the cards.
export function GenerateBar() {
  const { loading, stageLabel, progress, error, generate } = useStudio();
  const summary = useSummary();
  const last = useLastRun();

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-background p-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {loading ? (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex items-center justify-between text-sm">
            <span>{stageLabel}…</span>
            <span className="font-mono text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary.join(" · ")}</span>
          {last && (
            <Button asChild variant="outline" size="lg">
              <Link href={`/episode/${last.id}`}>
                <Play /> Last
              </Link>
            </Button>
          )}
          <Button size="lg" onClick={generate}>
            Generate
          </Button>
        </div>
      )}
    </div>
  );
}
