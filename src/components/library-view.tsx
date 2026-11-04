"use client";

import {
  CircleAlert,
  Clock,
  Ellipsis,
  Library,
  MessageCircleQuestion,
  Play,
  Plus,
  Podcast,
  RotateCcw,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ttsBlob } from "@/lib/export";
import { library, listeningMinutes, questionCount, timeAgo, useRuns, type Run } from "@/lib/library";
import { LANGUAGES, SOURCE_KINDS } from "@/lib/podcast";
import { PageHeader } from "./app-shell";
import { ExportMenu } from "./menu";
import { KIND_ICON } from "./studio/cards";
import { useStudio } from "./studio/context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type Filter = "all" | "ready" | "failed";

function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" /> {label}
        </CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function SourceBadges({ run }: { run: Run }) {
  const shown = run.sources.slice(0, 2);
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {shown.map((s, i) => {
        const Icon = KIND_ICON[s.kind];
        return (
          <Badge key={i} variant="outline" className="max-w-44" title={`${SOURCE_KINDS.find((k) => k.id === s.kind)?.label}: ${s.label}`}>
            <Icon />
            <span className="truncate">{s.label}</span>
          </Badge>
        );
      })}
      {run.sources.length > 2 && <Badge variant="secondary">+{run.sources.length - 2}</Badge>}
    </div>
  );
}

function RunActions({ run, onDelete, onError }: { run: Run; onDelete: () => void; onError: (m: string) => void }) {
  const { remix } = useStudio();
  return (
    <div className="flex items-center justify-end gap-1.5">
      {run.episode ? (
        <>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/episode/${run.id}`}>
              <Play /> Open
            </Link>
          </Button>
          <ExportMenu episode={run.episode} lines={run.episode.lines} audio={ttsBlob(run.episode)} onError={onError} compact />
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => remix(run)}>
          <RotateCcw /> Retry
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="More actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => remix(run)}>
            <RotateCcw /> Open in studio
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RunTitle({ run }: { run: Run }) {
  return run.episode ? (
    <div className="flex min-w-0 flex-col">
      <Link href={`/episode/${run.id}`} className="truncate font-medium hover:underline">
        {run.episode.title}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{run.episode.summary}</span>
    </div>
  ) : (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 font-medium text-destructive">
        <CircleAlert className="size-3.5" /> Failed
      </span>
      <span className="truncate text-xs text-muted-foreground">{run.error}</span>
    </div>
  );
}

function runLength(run: Run): string {
  return run.episode ? `~${Math.max(1, Math.round(listeningMinutes(run.episode)))} min` : "—";
}

export function LibraryView() {
  const runs = useRuns();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDelete, setPendingDelete] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = runs?.filter((r) => r.episode) ?? [];
  const minutes = ready.reduce((m, r) => m + listeningMinutes(r.episode!), 0);
  const questions = ready.reduce((n, r) => n + questionCount(r.episode!), 0);
  const failed = (runs?.length ?? 0) - ready.length;

  const q = query.trim().toLowerCase();
  const visible = (runs ?? []).filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!q) return true;
    const haystack = [r.episode?.title, r.episode?.summary, r.error, ...r.sources.map((s) => s.label)].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div className="flex min-h-svh flex-col">
      <PageHeader title="Library">
        <Button asChild size="sm">
          <Link href="/">
            <Plus /> New episode
          </Link>
        </Button>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 lg:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Podcast} label="Episodes" value={runs ? String(ready.length) : "–"} hint={failed ? `${failed} failed` : undefined} />
          <Stat icon={Clock} label="Listening time" value={runs ? `${Math.round(minutes)}m` : "–"} />
          <Stat icon={MessageCircleQuestion} label="Questions asked" value={runs ? String(questions) : "–"} />
          <Stat
            icon={Library}
            label="Sources read"
            value={runs ? String(ready.reduce((n, r) => n + r.sources.length, 0)) : "–"}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles and sources" className="pl-8" />
          </div>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={filter} onValueChange={(v) => v && setFilter(v as Filter)}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="ready">Ready</ToggleGroupItem>
            <ToggleGroupItem value="failed">Failed</ToggleGroupItem>
          </ToggleGroup>
          {error && <span className="text-xs text-destructive sm:ml-auto">{error}</span>}
        </div>

        {!runs ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <Card className="items-center py-12 text-center">
            <CardHeader className="w-full max-w-sm justify-items-center">
              <Podcast className="mb-2 size-8 text-muted-foreground" />
              <CardTitle>No episodes yet</CardTitle>
              <CardDescription>Episodes you generate are saved here, in this browser.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild>
                <Link href="/">
                  <Plus /> New episode
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/sample">
                  <Play /> Play the sample
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No episodes match.</p>
        ) : (
          <>
            <Card className="hidden py-0 md:flex">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Episode</TableHead>
                    <TableHead>Sources</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Length</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="max-w-80 pl-4">
                        <RunTitle run={run} />
                      </TableCell>
                      <TableCell className="max-w-64">
                        <SourceBadges run={run} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {LANGUAGES.find((l) => l.id === run.settings.language)?.label}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{runLength(run)}</TableCell>
                      <TableCell className="text-muted-foreground">{timeAgo(run.createdAt)}</TableCell>
                      <TableCell className="pr-4">
                        <RunActions run={run} onDelete={() => setPendingDelete(run)} onError={setError} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div className="flex flex-col gap-2 md:hidden">
              {visible.map((run) => (
                <Card key={run.id} size="sm">
                  <CardContent className="flex flex-col gap-3">
                    <RunTitle run={run} />
                    <SourceBadges run={run} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {LANGUAGES.find((l) => l.id === run.settings.language)?.label} · {runLength(run)} ·{" "}
                        {timeAgo(run.createdAt)}
                      </span>
                      <div className="ml-auto">
                        <RunActions run={run} onDelete={() => setPendingDelete(run)} onError={setError} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this episode?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.episode?.title ?? "This failed run"} will be removed from this browser. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) library.remove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
