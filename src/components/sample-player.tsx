"use client";

import sample from "@/data/sample-episode.json";
import type { Episode } from "@/lib/podcast";
import { Player } from "./player";

export function SamplePlayer() {
  return <Player episode={sample as Episode} />;
}
