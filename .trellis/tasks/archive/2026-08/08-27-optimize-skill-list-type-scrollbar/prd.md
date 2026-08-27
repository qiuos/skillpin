# 优化技能列表排版与滚动条样式

## Goal

调整技能列表页面的文字层级和窗口滚动条视觉，使其更符合整体界面风格；在用户确认方案前不修改产品代码。

## What I already know

* 用户反馈：技能列表标题与描述字号偏大，顶部 Tab 字号偏小。
* 期望字号：标题约 28、正文约 24、按钮约 24。
* 用户指出“技能页”尚未调整文字。
* 当前原生滚动条带白色轨道背景，与界面整体风格不符。

## Assumptions (temporary)

* 所有需要调整的界面位于前端样式层。
* “窗口滑动的滚动条”指应用内可滚动区域的滚动条，而非系统窗口装饰。

## Open Questions

* 字号调整是否应统一覆盖技能列表与技能页，还是仅列表页？
* 滚动条是否按当前主题自动适配，还是使用固定深色风格？

## Requirements (evolving)

* 在确认方案后，再调整技能列表、技能页和顶部 Tab 的文字层级。
* 优化滚动条轨道与滑块，使其不再显示突兀的白色背景，并与应用主题协调。

## Acceptance Criteria (evolving)

* [ ] 技能列表与技能页的标题、正文、按钮字号符合确认后的设计规范。
* [ ] 顶部 Tab 文字的可读性与整体视觉层级得到改善。
* [ ] 可滚动区域不再显示突兀的白色滚动条背景。
* [ ] 修改在目标平台上构建通过。

## Definition of Done (team quality bar)

* Tests added/updated where appropriate
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 不重做页面布局、色彩系统或交互逻辑。
* 不改变技能数据、排序或筛选行为。

## Technical Notes

* 已检查：`packages/web/src/styles.css`、`packages/web/src/app/app.tsx`、`packages/web/src/features/catalog/skills-workbench-page.tsx`、`packages/web/src/features/sources/source-list-page.tsx`。
* 技能工作台目前使用 `--skill-title-size: 32px`、`--skill-workbench-copy-size: 24px`、控制项高度 `64px`。列表标题和详情标题均继承 32px；列表说明、操作按钮已是 24px。
* 顶部 Tab（`.identity-nav__item`）未单独设置字号，当前继承全局 `--font-ui: 16px`。
* 技能源页仍使用 16px/22px 为主的字号体系：页标题 22px、来源名称 16px、操作按钮 16px，因此与技能页的放大版文字层级不一致。
* 现有滚动容器包括技能列表、技能详情正文、候选来源、Markdown 代码块、目录浏览器和窄屏页面；项目尚未定义 scrollbar 样式，浏览器默认轨道会显示白色。

## Decision (ADR-lite)

**Context**: 技能工作台采用了 32px 标题和 24px 正文，而顶部 Tab 与技能源页仍保持旧的 16px/22px 体系；浏览器原生白色滚动条轨道也破坏了羊皮纸、金色和深棕组成的界面视觉。

**Decision**: 统一主要工作页面为“标题 28px、正文与业务操作 24px”，顶部 Tab 采用 24px 并同步扩大可点击区域；不全局放大状态栏和弹窗等应用外壳文字。为应用内滚动容器定义可复用的金棕主题滚动条：浅色内容区使用羊皮纸色轨道，窄屏外层页面使用深棕轨道，滑块使用金棕色并提供 hover 状态。用户已于 2026-08-27 确认。

**Consequences**: 技能源行和操作区的高度需要与文字同步增加，以保留触控和可读性；长路径继续保持单行省略，避免在列表中造成不可控的高度膨胀。

## Finalized Requirements

* 技能列表名称与技能详情名称从 32px 调整为 28px。
* 技能说明、详情摘要、技能操作按钮继续保持 24px，并据此收紧技能列表行的留白。
* 顶部“技能 / 技能源”Tab 调整为 24px，并增大高度和内边距，维持舒适点击区域。
* 技能源页主标题调整为 28px；来源名称、路径/状态信息、表头、工具栏文字及业务操作按钮统一为约 24px，并调整行与按钮高度。
* 为所有已识别的应用内滚动容器定义跨 Chromium/WebKit 与 Firefox 的主题滚动条；不得显示纯白默认轨道。
* 浅色内容滚动区使用羊皮纸色轨道和金棕滑块；窄屏的页面外层滚动区使用深棕轨道和金棕滑块。

## Acceptance Criteria (final)

* [x] 技能列表与详情标题显示为 28px，相关正文与业务按钮为 24px。
* [x] 顶部 Tab 显示为 24px，且点击区域没有拥挤或重叠。
* [x] 技能源页使用相同的主要文字层级，长路径仍以单行省略显示。
* [x] 技能列表、详情 Markdown、候选来源、目录浏览器和窄屏外层页面的滚动条无白色默认轨道，且与金棕主题一致。
* [x] 前端 typecheck、lint 与相关测试通过。
