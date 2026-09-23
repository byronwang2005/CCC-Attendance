# Contributing

感谢你愿意为 `CCC-Attendance` 做贡献。

## Before You Start

- 使用 Node.js 22 或更高版本。

## Local Setup

按锁文件安装依赖：

```bash
npm ci
```

仅调试前端 UI 时使用 Vite：

```bash
npm run dev
```

需要调试 Cloudflare Functions 或完整主流程时，使用本地 D1 和 Pages 预览：

```bash
npm run build
npx wrangler d1 migrations apply QR_STATS_DB --local
npm run preview
```

不要对贡献测试使用 `--remote` 或直接运行 `npm run deploy`。

## Project Structure

- `src/`：React 前端、状态和交互。
- `functions/`：Cloudflare Pages Functions 和服务端工具。
- `public/`：静态资源和公开知识文件。
- `assets-src/`：仅供资源生成脚本使用、不随站点发布的源素材。
- `migrations/`：D1 迁移；数据库变更必须新增迁移，不得修改已有迁移。
- `scripts/`：测试和资源生成脚本。

## Contribution Rules

- 新功能优先复用可靠的 GitHub/npm 项目，同时检查许可证、维护状态和安全性。
- 沿用现有命名和目录边界，不要顺手重构无关文件。
- UI 改动需要检查 3 个步骤、移动端、性能、无障碍和 `prefers-reduced-motion`。
- 带有 `Generated` 标记或由 `scripts/` 输出的文件不得手动编辑；应修改源文件并重新运行对应脚本。

## Icons and Motion

- 只有同一控件或状态标记的图标会随状态变化时，才使用 `src/features/icons/MorphingIcon.tsx`；将 `lucide` 包导出的图标数据传给 `icon`，不要传入 `lucide-react` 组件，也不要为每个状态更换组件的 `key`。保持同一图标节点挂载，形变才能连续播放。
- 形变图标沿用现有图标的尺寸、线宽和 `currentColor`，并统一遵循 `prefers-reduced-motion`。图标仅作视觉反馈，按钮文字、选中状态和错误提示仍需独立表达操作含义。
- 不变的返回、关闭等图标继续使用构建期 SVG sprite。新增静态图标时修改 `scripts/build-icon-sprite.mjs` 并运行 `npm run icons:build`，不要手改 `public/assets/icons/actions.svg`。保持 `lucide` 与 `lucide-static` 版本一致。
- 改动图标交互时，验证状态来回切换、图标节点未重挂载，以及移动端和减少动态效果下的表现。

## Frontend Copy and Font Subsets

- 修改或新增前端文案后，运行 `python3 scripts/build-font-subsets.py` 补齐字体子集；该脚本需要本机可用的 `pyftsubset`。它会从 `index.html`、`README.md` 及 `src/`、`functions/`、`public/` 中收集字符，生成 `public/assets/fonts/` 下的两份中文 WOFF2，并更新 `functions/lib/qr-stats-fonts.js`。若新文案位于这些范围之外，先把对应源文件加入脚本的字符收集范围。
- 将实际变化的生成文件一并提交；若 WOFF2 内容变化，同时更新 `src/styles.css` 和 `src/404.css` 中字体 URL 的版本参数，避免浏览器继续使用旧字体。检查页面新增字符是否正确显示，且未意外回退到系统字体。
- 如果改动了受 `src/config.ts` 的 `COPY_LOCK` 保护的文案，同步审查该清单和 `src/copy-lock.test.ts`；只有在文案确已批准变更时才更新测试摘要。

## Commit Style (Use English)

- `feat: ...`：新功能。
- `fix: ...`：缺陷修复。
- `refactor: ...`：不改变行为的重构。
- `chore: ...`：文档、测试、依赖、资源和工具链调整。

## Pull Requests

- PR 标题与最终 Commit message 保持同一语义。
- 说明改了什么、为什么修改，以及对 UI、API、二维码、时间或数据库的影响。
- UI改动需要附上截图或录屏。

## Validation

提交前运行：

```bash
npm test
npm run lint
npm run build
```
