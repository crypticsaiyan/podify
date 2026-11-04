import { Suspense } from "react";
import { PlayerSkeleton, StoredEpisode } from "@/components/stored-episode";

// Episodes live in the browser's storage, so the id is only resolved here and loaded client-side.
export default function EpisodePage({ params }: PageProps<"/episode/[id]">) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      {params.then(({ id }) => (
        <StoredEpisode id={id} />
      ))}
    </Suspense>
  );
}
