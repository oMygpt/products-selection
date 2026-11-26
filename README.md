# Products Selection · 每日精选产品体验台

> **简报来源与体验台解耦**：上游多 Agent 独立写入 `alonegg/daily-product-briefings`，`oMygpt/products-selection` 负责统一去重汇总、后台 Agent 查验官网/GitHub README（Qwen `qwen3.8-flash`）、生成结构化体验指引与产品主表，并自动发布到 Cloudflare Pages 与 GitHub Pages。

## 架构说明

1. **上游多 Agent 简报源（`alonegg/daily-product-briefings`）**：
   - Muse、Hark、Agent A 及任意后续新增的筛选 Agent 可各自独立向该仓库提交含 `YYYY-MM-DD` 日期的 `.md` 简报（通过仓库 Secret `BRIEFINGS_DEPLOY_KEY` 拉取）。
   - **推荐治本格式**：上游 Agent 可在简报末尾附一个 `json` 代码块（`{ "products": [{ "name", "url", "repo", "tagline", "pricing", "source" }] }`），解析器优先读取该结构化块，同时兼容各类历史 Markdown 排版。
2. **后台查验与结构化 Agent（`playground/enrich-agent.mjs`）**：
   - 汇总同日所有简报条目（去重合并、统计多源推荐次数）。
   - 优先通过直达官网与 GitHub API 拉取正文、OG 预览图、`X-Frame-Options/CSP` 可嵌入状态、在线 Demo 链接及开源健康信号（最近推送、Release、Open Issues）。
   - 调用 Qwen 模型生成分类、交付形态、规范化定价（与开源协议分离）、上手体验步骤、体验门槛、真实坑点与同类对比，增量缓存至 `playground/enriched-products.json`，并将失败条目写入重试队列（`.enrich-failed.json`，最多重试 3 次）。
   - **历史回填**：`--backfill N` 每次从全量历史中补查一批（旧 schema 升级优先 → 有链接的新品 → 无链接条目），CI 每轮 60 条；`--dry-run` 只打印队列不发请求。
   - **仓库匹配校验**：落地页上的 GitHub 链接、按名搜索到的仓库，都必须与产品名 / 官网域名对得上才采用，避免把竞品或依赖当成产品仓库。
3. **产品体验台前端（`playground/public/`）**：
   - **试用成本（`public/trial-cost.js`）**：构建期与浏览器共用同一模型回答「试这个要花多大代价」——需特定硬件 > Agent 查验结果 > 真实在线 Demo > 按形态估算（标「估」）。首页按试用成本加权随机抽取一主两备（`R` 换一组），「现在就能玩」来自 `data/quick.json`；产品库支持「5 分钟内 / 免注册直玩 / 免费」组合筛选。
   - **今日试用 / 每周精选 / 产品库 / 我的记录**：支持场景筛选、多维排序、URL 深度链接分享与 RSS 订阅（`feed.xml`）。
   - **安全与速度**：README 渲染采用严格白名单净化 + CSP；GitHub Token 仅存 `sessionStorage`；零外部字体 CDN 阻塞，国内秒开。
   - **分层试玩**：L0 在线 Demo / Playground → L1 免 PAT 一键 `codespaces.new` / `github.dev` → L2 一行 CLI 命令复制；同时保留进阶 PAT 托管的 Codespaces 控制。
4. **全自动发布流水线（`.github/workflows/deploy-pages.yml`）**：
   - 每日定时（北京时间 `08:00`、`16:00`、`22:00`）或每次 push 自动拉取最新简报 → 运行 `enrich-agent.mjs` → 编译静态数据（带空期解析门禁）→ 运行 `node --test` → 同步部署到 **Cloudflare Pages**（优先使用最小权限 `CLOUDFLARE_API_TOKEN`）与 **GitHub Pages**。

## 数据版本管理

- **提交进 git**：`playground/enriched-products.json`（查验缓存）、`playground/.enrich-failed.json`（重试队列）、`playground/public/data/raw/`（上游简报只增快照，也是解析回归测试的样本）。
- **不提交、由 CI 每次重建**：`public/data/{day,products}/`、`explore.json`、`weekly.json`、`quick.json`、`days.json`、`feed.xml`。没有 `.muse-repo` 时 `build-static.mjs` 会从 `raw/` 重建。

## 在线访问

- **主域名**：https://picks.chunlin.ch
- **短链别名**：https://try.chunlin.ch
- **RSS 订阅**：https://picks.chunlin.ch/feed.xml
- **Cloudflare Pages**：https://products-selection.pages.dev
- **GitHub Pages**：https://omygpt.github.io/products-selection/

---

## 本地调试与测试

```bash
# 1. 拉取上游最新多 Agent 简报（首次：git clone git@github.com:alonegg/daily-product-briefings.git .muse-repo）
git -C .muse-repo pull --ff-only

# 2. 运行后台查验 Agent（默认处理最近 2 天未查验的新品 + 失败重试队列）
node playground/enrich-agent.mjs --days 2
# 只看回填队列、不发请求：node playground/enrich-agent.mjs --backfill 60 --dry-run

# 3. 编译静态 JSON 数据集、产品主表、每周精选、quick.json 与 RSS（派生文件不入库，本地需先跑一次）
node playground/build-static.mjs

# 4. 运行单元测试
node --test playground/test/*.test.mjs

# 5. 启动本地分屏体验台 (http://127.0.0.1:4321)
node playground/server.mjs
```
