type CoverCandidate = { id: string; sha256?: string | null; publicUrl: string };

/** Collapse identical files for display only; keep the saved cover's Asset ID. */
export function projectCoverCandidates<T extends CoverCandidate>(
  images: T[],
  selectedId?: string | null,
): T[] {
  const positions = new Map<string, number>();
  const candidates: T[] = [];
  const ids = new Set<string>();
  for (const image of images) {
    if (ids.has(image.id)) continue;
    ids.add(image.id);
    const key = image.sha256 ? `hash:${image.sha256}` : `url:${image.publicUrl}`;
    const index = positions.get(key);
    if (index === undefined) {
      positions.set(key, candidates.length);
      candidates.push(image);
    } else if (image.id === selectedId) {
      candidates[index] = image;
    }
  }
  return candidates;
}
