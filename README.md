# Products Selection · 每日精选产品体验台

> **简报来源与体验台解耦**：上游多 Agent 独立写入 `alonegg/daily-product-briefings`，`oMygpt/products-selection` 负责统一去重汇总、后台 Agent 穿透官网/README 查验（Qwen `qwen3.8-flash`）、生成结构化体验指引，并自动发布到 Cloudflare Pages 与 GitHub Pages。

## 架构说明

1. **上游多 Agent 简报源（`alonegg/daily-product-briefings`）**：
   - Muse、Agent A 及任意后续新增的筛选 Agent 可各自独立向该仓库的目录（如 `agent-a/`、根目录或新子目录）提交含 `YYYY-MM-DD` 日期的 `.md` 简报。
   - 本机已生成专用读写权限 Deploy Key（`~/.ssh/daily_product_briefings_agent_ed25519`），已注册至 `alonegg/daily-product-briefings`（`multi-agent-briefings-rw`）并同步配置到本仓库 Secret `BRIEFINGS_DEPLOY_KEY`。
2. **后台查验与结构化 Agent（`playground/enrich-agent.mjs`）**：
   - 汇总同日所有简报条目（去重合并、不区分来源展示）。
   - 对缺乏直达官网或仅含 Product Hunt / BetaList 链接的产品，通过搜索与 GitHub 反查绕过 Cloudflare 拦截，抓取真实官网正文与 GitHub `README.md`。
   - 调用 Qwen 模型生成三维分类（产品类型 + 交付形态 + 费用模式）、产品介绍、上手体验步骤与默认端口，增量缓存至 `playground/enriched-products.json`。
3. **产品体验台前端（`playground/public/`）**：
   - **产品详情 / README**：完整 Markdown `README.md` 渲染、快速启动命令一键复制、上手体验指引。
   - **Codespace 真机体验**：支持配置 GitHub Key（`codespace` + `repo` 权限），一键创建/启停/销毁云端容器并转发端口在线试玩。
   - **网页在线试玩**：支持网页内嵌预览。
4. **全自动发布流水线（`.github/workflows/deploy-pages.yml`）**：
   - 每日定时（北京时间 `08:00`、`16:00`、`22:00`）或每次 push 自动拉取最新简报 → 运行 `enrich-agent.mjs` → 编译静态数据 → 同步部署到 **Cloudflare Pages** 与 **GitHub Pages**。

---

## 本地调试与手动运行

```bash
# 1. 拉取上游最新多 Agent 简报
git -C .muse-repo pull --ff-only

# 2. 运行后台查验 Agent（默认处理最近 2 天未查验的新品）
node playground/enrich-agent.mjs --days 2

# 3. 编译静态 JSON 数据集
node playground/build-static.mjs

# 4. 启动本地分屏体验台 (http://127.0.0.1:4321)
node playground/server.mjs
```
