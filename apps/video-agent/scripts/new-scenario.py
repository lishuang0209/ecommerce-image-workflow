#!/usr/bin/env python3
"""
复制一个已有场景包，作为新场景的起点。

用法（在项目根目录执行）：
    python3 scripts/new-scenario.py pet_food_ad --from ecommerce_ad --name 宠物食品广告

会生成 backend/scenarios/pet_food_ad/，然后：
    1. 修改 scenario.yaml 中的名称、文案、阶段和默认参数；
    2. 修改 prompts/ 下的提示词（不需要覆盖的文件可以直接删掉，会回退到默认提示词）；
    3. 重启后端，或调用 POST /api/scenarios/reload，首页就能选择新场景。

只依赖 Python 标准库。
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS = ROOT / "backend" / "scenarios"
SAFE_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def main() -> int:
    parser = argparse.ArgumentParser(description="复制一个场景包作为新场景的起点")
    parser.add_argument("scenario_id", help="新场景 id：小写字母开头，只含小写字母、数字和下划线，例如 pet_food_ad")
    parser.add_argument("--from", dest="source", default="short_film", help="复制哪个场景（默认 short_film）")
    parser.add_argument("--name", help="新场景在界面上显示的名称")
    args = parser.parse_args()

    if not SAFE_ID.match(args.scenario_id):
        print(f"场景 id 不合法：{args.scenario_id!r}。请使用小写字母、数字和下划线，并以字母开头。", file=sys.stderr)
        return 1

    source = SCENARIOS / args.source
    target = SCENARIOS / args.scenario_id
    if not (source / "scenario.yaml").is_file():
        available = ", ".join(sorted(p.name for p in SCENARIOS.iterdir() if (p / "scenario.yaml").is_file()))
        print(f"找不到场景 {args.source!r}。可选：{available}", file=sys.stderr)
        return 1
    if target.exists():
        print(f"{target.relative_to(ROOT)} 已存在，请换一个 id。", file=sys.stderr)
        return 1

    shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__"))

    manifest = target / "scenario.yaml"
    text = manifest.read_text(encoding="utf-8")
    name = args.name or args.scenario_id
    text = re.sub(r"^name:.*$", f"name: {name}", text, count=1, flags=re.MULTILINE)
    text = re.sub(r"^order:.*$", "order: 100", text, count=1, flags=re.MULTILINE)
    text = re.sub(r"^id:.*\n", "", text, count=1, flags=re.MULTILINE)
    header = f"# 由 scripts/new-scenario.py 从 {args.source} 复制而来，请按你的场景修改。\n"
    manifest.write_text(header + text, encoding="utf-8")

    print(f"已创建 {target.relative_to(ROOT)}（复制自 {args.source}）")
    print("下一步：")
    print(f"  1. 编辑 {manifest.relative_to(ROOT)}：名称、文案、阶段、默认参数")
    print(f"  2. 编辑 {(target / 'prompts').relative_to(ROOT)}/ 下的提示词")
    print("  3. 运行 cd backend && uv run --extra dev pytest tests/test_scenarios.py 检查格式")
    print("  4. 重启后端或 POST /api/scenarios/reload，然后在首页选择新场景")
    return 0


if __name__ == "__main__":
    sys.exit(main())
