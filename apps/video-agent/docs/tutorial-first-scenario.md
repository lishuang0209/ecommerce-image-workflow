# 30 分钟做出你的第一个场景

这篇教程带你从零做出一个新场景：**「知识科普短视频」**。用户输入一个知识点，系统生成一条 60 秒左右、有主持人讲解的竖屏科普视频。

做完后你会知道：一个 AIGC 产品场景由哪些部分组成，改哪些文件，怎样验证效果。换成你自己的领域（房产、教育、餐饮、汽车……），步骤完全一样。

> 前提：项目已经能在本地跑起来（见 [README](../README.md) 的快速开始），并且在「设置」页填好了模型 API Key。

---

## 第 1 步：先当产品经理，想清楚场景（5 分钟）

动手前先回答这几个问题，写在纸上或文档里：

| 问题 | 知识科普短视频的答案 |
| --- | --- |
| 用户是谁？ | 知识类博主、老师、科普机构的运营 |
| 用户输入什么？ | 一个知识点 + 目标观众，例如“为什么天空是蓝色的，给小学生讲” |
| 最终产出什么？ | 60 秒竖屏视频：主持人讲解 + 示意画面 |
| 需要哪些阶段？ | 讲解脚本 → 主持人与场景设定 → 分镜 → 画面 → 视频 → 成片（与短片相同，都是 6 个阶段） |
| 和现有场景最像哪个？ | 电商广告片：篇幅短、有旁白、要讲清楚一件事 |
| 质量标准是什么？ | 知识准确、讲解有趣、一个视频只讲一个知识点 |

最后一个问题最重要：它决定了提示词里的“评审标准”怎么写。

## 第 2 步：用脚手架复制一个场景（1 分钟）

在项目根目录运行：

```bash
python3 scripts/new-scenario.py science_explainer --from ecommerce_ad --name 知识科普短视频
```

会得到 `backend/scenarios/science_explainer/`：

```text
science_explainer/
  scenario.yaml                 ← 场景声明
  prompts/
    script/generate_script_zh.txt   ← 写脚本
    script/revise_script_zh.txt     ← 改稿
    script/eval_plot_zh.txt         ← 评审标准
    script/meta_extract_zh.txt      ← 提取人物和场景
    character/...  setting/...      ← 设定图画面
```

## 第 3 步：改 scenario.yaml（5 分钟）

打开 `scenario.yaml`，按第 1 步的答案修改：

```yaml
name: 知识科普短视频
tagline: 输入一个知识点，生成 60 秒科普视频
description: 主持人出镜讲解 + 示意画面，适合知识类博主和科普机构。
category: video
order: 60

defaults:
  style: 3d-disney        # 卡通 3D 风格更适合科普
  video_ratio: "9:16"
  episodes: 1

ui:
  hero_title: 一个知识点，一条科普视频
  hero_subtitle: 写下知识点和目标观众，AI 生成讲解脚本、主持人形象和讲解视频
  placeholder: 例如：为什么天空是蓝色的？给小学高年级的孩子讲，要有生活中的例子……
  episodes_label: 版本数
  examples:
    - title: 天空为什么是蓝色
      description: 给小学生讲光的散射
      idea: 为什么天空是蓝色的、夕阳是红色的？给小学高年级的孩子讲，用生活中的例子解释光的散射。
    - title: 复利的力量
      description: 给刚工作的年轻人
      idea: 用通俗的方式给刚工作的年轻人讲清楚复利，配一个每月存钱的例子，不涉及具体理财产品推荐。

stages:
  - type: script_generation
    name: 讲解脚本
    short_name: 脚本
    options:
      min_episode_lines: 10
      max_episode_lines: 16
  - type: character_design
    name: 主持人与场景
    short_name: 设定
  - type: storyboard
    name: 分镜
  - type: reference_generation
    name: 画面
  - type: video_generation
    name: 视频
  - type: post_production
    name: 成片
```

改完就能在首页看到新场景了：重启后端，或运行下面的命令重新加载场景包。

```bash
curl -X POST http://localhost:8000/api/scenarios/reload
```

## 第 4 步：改提示词（10 分钟）

提示词决定了产出质量，也是不同场景之间差异最大的地方。按重要性排序：

1. **`script/generate_script_zh.txt`（必改）**：告诉 AI 这是什么内容、什么结构、什么标准。比如科普视频的结构是“提问钩子 → 生活现象 → 原理讲解 → 类比 → 总结金句”，要求“知识必须准确，不确定的内容不要写”。
2. **`script/eval_plot_zh.txt`（建议改）**：评审标准，把第 1 步定下的质量标准写进去。
3. **`script/revise_script_zh.txt`**：改稿规则，篇幅要和 `options` 里的行数一致。
4. **`script/meta_extract_zh.txt`**：从电商场景复制来的版本会把“商品”当主体，要改成“主持人 + 讲解场景”。
5. **`character/character_zh.txt`、`setting/setting_zh.txt`**：设定图的画面描述，比如主持人要亲和、场景是明亮的演播室或实验室。

不需要改的文件直接删掉，会自动回退到默认提示词。

**两条硬规则：**

- 只能使用原文件里已有的 `{占位符}`（如 `{idea}`、`{style}`、`{episodes}`），JSON 示例里的花括号写成 `{{ }}`。
- 剧本格式必须保留：`## 第N集`、`**第x集-第y场 日/夜 内/外 场景名**`、`人物：` 行、`<action>` 动作行、`角色名（情绪）：台词` 台词行。分镜程序依赖这些格式。

## 第 5 步：自动检查（1 分钟）

```bash
cd backend && uv run --extra dev pytest tests/test_scenarios.py
```

这会检查 YAML 字段、阶段顺序、提示词里的占位符和花括号。测试全部通过再进行下一步。

## 第 6 步：在界面里跑一遍，迭代提示词（8 分钟+）

1. 打开 http://localhost:3000 ，选择「知识科普短视频」，点一个灵感示例，生成。
2. **重点看第一个阶段的脚本**：结构对不对、知识准不准、篇幅合不合适。不满意就改 `generate_script_zh.txt`，然后新建项目再试。提示词不需要重启后端，每次执行阶段都会重新读取。
3. 脚本满意后，再继续往后看设定图、分镜和画面。哪个阶段不满意，就改哪个阶段的提示词。

真正花时间的是这一步：**改提示词 → 生成 → 看结果 → 再改**。建议准备 3-5 个典型输入，每次修改后都用它们跑一遍，对比效果。

## 用 AI 编程工具来做

上面每一步都可以交给 Claude Code / Cursor 来做。可以这样描述你的需求：

> 读一下 CLAUDE.md 和 docs/scenarios.md。帮我新建一个场景包 science_explainer：知识科普短视频，用户输入一个知识点和目标观众，生成 60 秒竖屏主持人讲解视频。从 ecommerce_ad 复制，修改 scenario.yaml 和 prompts 下的提示词，结构是“提问钩子 → 生活现象 → 原理讲解 → 类比 → 总结金句”，每集 10-16 行。改完运行 tests/test_scenarios.py 确认通过。

拿到结果后，你要做的是**验收**：读一遍它写的提示词，判断是否符合你对这个场景的理解，再到界面里跑真实的例子。

## 下一步

- 想加一个提示词做不到的环节（比如“知识点事实核查”），看 [场景包参考 · 自定义阶段 Agent](scenarios.md#自定义阶段-agent)。
- 想做纯图像产品，参考 `product_poster`：只保留前 4 个阶段，参考图就是最终产出。
- 看看 5 个内置场景都是怎样设计的：[示例场景拆解](examples.md)。
