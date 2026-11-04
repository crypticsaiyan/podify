"use client";

import { useMediaQuery } from "@/hooks/use-mobile";
import { PageHeader } from "./app-shell";
import { Canvas } from "./studio/canvas";
import { AddSourceMenu, GenerateBar, HostsCard, ScriptCard, SourceCard } from "./studio/cards";
import { useStudio } from "./studio/context";

// Phones and tablets: the same cards in one scrolling column, with Generate pinned at the bottom.
function MobileStudio() {
  const { sources } = useStudio();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {sources.map((s) => (
          <SourceCard key={s.id} id={s.id} />
        ))}
        <AddSourceMenu className="self-start" />
        <div className="grid gap-3 md:grid-cols-2">
          <ScriptCard />
          <HostsCard />
        </div>
      </div>
      <GenerateBar />
    </div>
  );
}

export function Studio() {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  return (
    <div className="flex h-svh flex-col">
      <PageHeader title="Studio">
        <span className="hidden text-xs text-muted-foreground md:inline">
          Add sources, pick a style and voices, then generate
        </span>
      </PageHeader>
      {desktop ? (
        <div className="min-h-0 flex-1 p-3">
          <Canvas />
        </div>
      ) : (
        <MobileStudio />
      )}
    </div>
  );
}
