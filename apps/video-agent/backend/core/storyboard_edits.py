"""Validation and numbering for manually edited storyboards."""

import copy


def normalize_storyboard_edits(episodes):
    if not isinstance(episodes, list) or not episodes:
        raise ValueError("分镜至少需要保留一集，每集至少保留一个片段。")
    result = copy.deepcopy(episodes)
    seen_ids = set()
    for episode in result:
        if not isinstance(episode, dict):
            raise ValueError("分集格式无效。")
        segments = episode.get("segments")
        if not isinstance(segments, list) or not segments:
            raise ValueError("每集至少保留一个片段。")
        for index, segment in enumerate(segments, 1):
            if not isinstance(segment, dict):
                raise ValueError("片段格式无效。")
            segment_id = segment.get("segment_id")
            if not isinstance(segment_id, str) or not segment_id or segment_id in seen_ids:
                raise ValueError("片段 ID 不能为空或重复。")
            seen_ids.add(segment_id)
            shots = segment.get("shots")
            if not isinstance(shots, list) or not shots:
                raise ValueError(f"片段 #{index} 没有镜头，请删除空片段或添加镜头。")
            total = 0
            for shot_index, shot in enumerate(shots, 1):
                if not isinstance(shot, dict) or not isinstance(shot.get("content"), str) or not shot["content"].strip():
                    raise ValueError(f"片段 #{index} 的镜头内容不能为空。")
                duration = shot.get("duration")
                if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not 2 <= duration <= 15 or int(duration) != duration:
                    raise ValueError("每个镜头的时长必须为 2–15 秒的整数。")
                shot.update(shot_number=shot_index, duration=int(duration), content=shot["content"].strip())
                total += duration
            if not 5 <= total <= 15:
                raise ValueError(f"片段 #{index} 的总时长必须为 5–15 秒。")
            segment.update(segment_number=index, total_duration=int(total))
    return result
