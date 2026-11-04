// Small app-specific building blocks on top of shadcn/ui.

import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const HOST_TEXT = ["text-host-a", "text-host-b"] as const;
export const HOST_BG = ["bg-host-a", "bg-host-b"] as const;

export function HostDot({ host, className }: { host: 0 | 1; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", HOST_BG[host], className)} aria-hidden />;
}

export function HostAvatar({
  name,
  host,
  size = "default",
  active = false,
  className,
}: {
  name: string;
  host: 0 | 1;
  size?: "sm" | "default" | "lg";
  active?: boolean;
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn("transition", active && "ring-2 ring-ring ring-offset-2 ring-offset-background", className)}>
      <AvatarFallback className={cn("bg-muted font-medium", HOST_TEXT[host])}>{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

export function EpisodeTile({ className }: { className?: string }) {
  return (
    <div className={cn("grid shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground", className)} aria-hidden>
      <AudioLines className="size-1/3" />
    </div>
  );
}
