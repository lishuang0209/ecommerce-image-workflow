## 改了什么

<!-- 一两句话说明这个 PR 做了什么、为什么。关联 Issue 可写 Closes #123 -->

## 类型

- [ ] 新增 / 修改场景包（`backend/scenarios/<id>/`）
- [ ] 后端功能或修复
- [ ] 前端界面
- [ ] 文档
- [ ] 其他：

## 自查清单

- [ ] `cd backend && uv run --extra dev pytest` 通过
- [ ] 改了前端：`cd frontend && npx tsc --noEmit -p . && npm run build` 通过
- [ ] 没有提交任何 API Key（`backend/config.yaml`、`.env`、`registry/models.local.yaml` 已被 git 忽略，不要强行添加）
- [ ] 没有硬编码产品名（后端用 `settings.APP_NAME`，前端用 `brand.name`）
- [ ] 新增配置项已同步到 `config.py` 和 `config.yaml.example`
- [ ] 界面改动附上截图

## 截图

<!-- 界面改动或新场景请贴截图：首页场景卡片、关键阶段结果等 -->
