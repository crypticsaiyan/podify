"use client";

import { Library } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { library, useRuns, type Run } from "@/lib/library";
import type { Episode } from "@/lib/podcast";
import { PageHeader } from "./app-shell";
import { Player } from "./player";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export function PlayerSkeleton() {
  return (
    <div className="flex h-svh flex-col">
      <PageHeader title={<Skeleton className="h-4 w-48" />} />
      <div className="grid flex-1 gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:p-4">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="hidden rounded-xl lg:block" />
      </div>
    </div>
  );
}

// The episode is captured once on mount: saving live Q&A back to the library re-reads storage,
// and the player must not restart because of that.
function Loaded({ run }: { run: Run & { episode: Episode } }) {
  const [episode] = useState(run.episode);
  return <Player episode={episode} onLinesChange={(lines) => library.update(run.id, { episode: { ...episode, lines } })} />;
}

export function StoredEpisode({ id }: { id: string }) {
  const runs = useRuns();
  if (!runs) return <PlayerSkeleton />;
  const run = runs.find((r) => r.id === id);
  if (!run?.episode) {
    return (
      <div className="flex h-svh flex-col">
        <PageHeader title="Episode not found" />
        <div className="grid flex-1 place-items-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Episode not found</CardTitle>
              <CardDescription>
                Episodes are saved in this browser only. It may have been deleted, or created on another device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/library">
                  <Library /> Go to library
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  return <Loaded key={run.id} run={run as Run & { episode: Episode }} />;
}
