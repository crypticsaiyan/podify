"use client";

import { AudioLines, Library, Play, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useRuns } from "@/lib/library";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { StudioProvider } from "./studio/context";

const NAV = [
  { href: "/", label: "Studio", icon: SquarePen },
  { href: "/library", label: "Library", icon: Library },
  { href: "/sample", label: "Sample episode", icon: Play },
];

function AppSidebar({ pathname }: { pathname: string | null }) {
  const runs = useRuns();
  const { setOpenMobile } = useSidebar();
  const recent = (runs ?? []).filter((r) => r.status === "ready").slice(0, 6);
  const close = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={close}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                  <AudioLines className="size-4" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">Podify</span>
                  <span className="text-xs text-muted-foreground">Podcasts you can talk to</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild tooltip={item.label} isActive={pathname === item.href}>
                    <Link href={item.href} onClick={close}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.href === "/library" && runs && runs.length > 0 && <SidebarMenuBadge>{runs.length}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {recent.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent episodes</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recent.map((run) => (
                  <SidebarMenuItem key={run.id}>
                    <SidebarMenuButton asChild size="sm" isActive={pathname === `/episode/${run.id}`}>
                      <Link href={`/episode/${run.id}`} onClick={close}>
                        <span className="truncate">{run.episode?.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-xs text-muted-foreground">
          Built on AssemblyAI: LLM Gateway, Text-to-Speech and Streaming Speech-to-Text.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// usePathname is request data in Next 16, so it has to sit under Suspense; the fallback
// renders the same sidebar without an active item.
function RoutedSidebar() {
  return <AppSidebar pathname={usePathname()} />;
}

export function PageHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <span className="mr-1 h-4 w-px bg-border" aria-hidden />
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <StudioProvider>
        <Suspense fallback={<AppSidebar pathname={null} />}>
          <RoutedSidebar />
        </Suspense>
        <SidebarInset className="min-w-0">{children}</SidebarInset>
      </StudioProvider>
    </SidebarProvider>
  );
}
