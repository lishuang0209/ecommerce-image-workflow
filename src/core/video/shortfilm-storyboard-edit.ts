import { z } from 'zod';
import type { ShortfilmStoryboardArtifact } from './shortfilm-contract';

export const storyboardEditSchema = z.object({
  episodes: z.array(z.object({
    episode_number: z.number().int().positive(),
    episode_title: z.string().trim().max(500),
    segments: z.array(z.object({
      segment_id: z.string().min(1).max(200),
      location: z.string().trim().max(500),
      scene_time: z.string().trim().max(100),
      scene_space: z.string().trim().max(100),
      scene_context: z.string().trim().max(4000),
      characters: z.array(z.string().trim().min(1).max(200)).max(100),
      shots: z.array(z.object({
        shot_number: z.number().int().positive().optional(),
        shot_type: z.string().trim().min(1).max(100),
        duration: z.number().int().min(2).max(15),
        content: z.string().trim().min(1).max(20_000),
      }).strict()).min(1).max(50),
    }).strict().refine((segment) => {
      const total = segment.shots.reduce((sum, shot) => sum + shot.duration, 0);
      return total >= 5 && total <= 15;
    }, 'Each segment must total 5–15 seconds.')).min(1).max(200),
  }).strict()).min(1).max(10),
}).strict();

export type StoryboardEdits = z.infer<typeof storyboardEditSchema>;

/** Allow edits and deletion while preserving surviving segment ids and shot metadata. */
export function mergeStoryboardEdits(
  current: ShortfilmStoryboardArtifact,
  edits: StoryboardEdits
): ShortfilmStoryboardArtifact {
  if (current.episodes?.length !== edits.episodes.length) throw new Error('Storyboard structure changed.');
  return {
    ...current,
    episodes: current.episodes.map((episode, ei) => {
      const edited = edits.episodes[ei];
      if ((episode.episode_number ?? ei + 1) !== edited.episode_number) throw new Error('Storyboard structure changed.');
      const originalSegments = episode.segments ?? [];
      let lastSegmentIndex = -1;
      return {
        ...episode,
        episode_title: edited.episode_title,
        segments: edited.segments.map((next, si) => {
          const originalIndex = originalSegments.findIndex((segment) => segment.segment_id === next.segment_id);
          if (originalIndex <= lastSegmentIndex) throw new Error('Storyboard structure changed.');
          lastSegmentIndex = originalIndex;
          const segment = originalSegments[originalIndex];
          const originalShots = segment.shots ?? [];
          const positionalEdit = next.shots.every((shot) => shot.shot_number === undefined);
          if (positionalEdit && next.shots.length !== originalShots.length) throw new Error('Storyboard structure changed.');
          let lastShotIndex = -1;
          const shots = next.shots.map((shot, hi) => {
            const originalShotIndex = positionalEdit ? hi : originalShots.findIndex((original, index) =>
              (original.shot_number ?? index + 1) === shot.shot_number
            );
            if (originalShotIndex <= lastShotIndex) throw new Error('Storyboard structure changed.');
            lastShotIndex = originalShotIndex;
            return { ...originalShots[originalShotIndex], ...shot, shot_number: hi + 1 };
          });
          return {
            ...segment, ...next, segment_number: si + 1, shots,
            total_duration: shots.reduce((sum, shot) => sum + shot.duration, 0),
          };
        }),
      };
    }),
  };
}
