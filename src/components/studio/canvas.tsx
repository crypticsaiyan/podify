"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddSourceMenu, EpisodeCard, HostsCard, ScriptCard, SourceCard } from "./cards";
import { useStudio } from "./context";

const handle = { width: 8, height: 8 };

function SourceNode({ id }: NodeProps) {
  return (
    <div className="w-80">
      <SourceCard id={id} />
      <Handle type="source" position={Position.Right} style={handle} isConnectable={false} />
    </div>
  );
}

function ScriptNode() {
  return (
    <div className="w-80">
      <Handle type="target" position={Position.Left} style={handle} isConnectable={false} />
      <ScriptCard />
      <Handle type="source" position={Position.Right} style={handle} isConnectable={false} />
    </div>
  );
}

function HostsNode() {
  return (
    <div className="w-80">
      <HostsCard />
      <Handle type="source" position={Position.Right} style={handle} isConnectable={false} />
    </div>
  );
}

function EpisodeNode() {
  return (
    <div className="w-80">
      <Handle type="target" position={Position.Left} style={handle} isConnectable={false} />
      <EpisodeCard />
    </div>
  );
}

const nodeTypes = { source: SourceNode, script: ScriptNode, hosts: HostsNode, episode: EpisodeNode };

// Estimated card heights until React Flow has measured the real ones.
const ESTIMATE: Record<string, number> = { link: 150, github: 150, file: 150, text: 230, script: 230, hosts: 210, episode: 200 };
const GAP = 24;
const COLUMN = 420;

type Layout = Pick<Node, "position" | "measured" | "selected" | "dragging">;

function Flow() {
  const { sources, loading, addFiles } = useStudio();
  const { fitView } = useReactFlow();
  const [layout, setLayout] = useState<Record<string, Partial<Layout>>>({});
  const [dropping, setDropping] = useState(false);

  // Auto-layout: three columns, each vertically centered on the same axis, using measured heights.
  // A node the user dragged keeps its own position.
  const nodes = useMemo<Node[]>(() => {
    const height = (id: string, kind: string) => layout[id]?.measured?.height ?? ESTIMATE[kind];
    const stack = (items: { id: string; type: string; kind: string }[], x: number): Node[] => {
      const total = items.reduce((h, n) => h + height(n.id, n.kind) + GAP, -GAP);
      let y = -total / 2;
      return items.map((n) => {
        const node = { id: n.id, type: n.type, position: { x, y }, data: {} };
        y += height(n.id, n.kind) + GAP;
        return node;
      });
    };
    return [
      ...stack(sources.map((s) => ({ id: s.id, type: "source", kind: s.kind })), 0),
      ...stack([{ id: "script", type: "script", kind: "script" }, { id: "hosts", type: "hosts", kind: "hosts" }], COLUMN),
      ...stack([{ id: "episode", type: "episode", kind: "episode" }], COLUMN * 2),
    ].map((n) => ({ ...n, ...layout[n.id], deletable: false }));
  }, [sources, layout]);

  const edges = useMemo<Edge[]>(() => {
    const live = { stroke: "var(--muted-foreground)", strokeWidth: 1.5 };
    const idle = { stroke: "var(--border)", strokeWidth: 1.5, strokeDasharray: "4 4" };
    return [
      ...sources.map((s) => ({
        id: `e-${s.id}`,
        source: s.id,
        target: "script",
        animated: loading,
        style: s.value.trim() ? live : idle,
      })),
      { id: "e-script", source: "script", target: "episode", animated: loading, style: live },
      { id: "e-hosts", source: "hosts", target: "episode", animated: loading, style: live },
    ];
  }, [sources, loading]);

  // Only user drags, measurements and selection are kept; everything else comes from studio state.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLayout((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        if (c.type === "position" && c.position) next[c.id] = { ...next[c.id], position: c.position, dragging: c.dragging };
        else if (c.type === "dimensions" && c.dimensions) next[c.id] = { ...next[c.id], measured: c.dimensions };
        else if (c.type === "select") next[c.id] = { ...next[c.id], selected: c.selected };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 80);
    return () => clearTimeout(timer);
  }, [sources.length, fitView]);

  return (
    <div
      className="relative h-full overflow-hidden rounded-xl border bg-card/40"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const files = [...e.dataTransfer.files].filter((f) => /\.(pdf|txt|md|markdown)$/i.test(f.name));
        if (files.length) addFiles(files);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        style={{ background: "transparent" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(1 0 0 / 0.12)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center gap-3">
        <AddSourceMenu className="pointer-events-auto" />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileUp className="size-3.5" /> Drop PDF, TXT or Markdown files anywhere on the canvas
        </span>
      </div>

      {dropping && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-ring bg-background/80">
          <span className="flex items-center gap-2 text-sm font-medium">
            <FileUp className="size-4" /> Drop to add as sources
          </span>
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
