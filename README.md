# Products Selection · 每日精选产品体验台

> **简报来源与体验台解耦**：上游多 Agent 独立写入 `alonegg/daily-product-briefings`，`oMygpt/products-selection` 负责统一去重汇总、后台 Agent 查验官网/GitHub README（Qwen `qwen3.8-flash`）、生成结构化体验指引与产品主表，并自动发布到 Cloudflare Pages 与 GitHub Pages。

## 架构说明

1. **上游多 Agent 简报源（`alonegg/daily-product-briefings`）**：
   - Muse、Hark、Agent A 及任意后续新增的筛选 Agent 可各自独立向该仓库提交含 `YYYY-MM-DD` 日期的 `.md` 简报（通过仓库 Secret `BRIEFINGS_DEPLOY_KEY` 拉取）。
   - **结构化产品块（治本格式）**：上游简报末尾追加一个 `json` 代码块（字段约定见上游仓库 [`FORMAT.md`](https://github.com/alonegg/daily-product-briefings/blob/main/FORMAT.md)：`name`、`url`/`repo`、`tagline`、`pricing`、`trial`、`minutes`、`demoUrl`、`hardware`、`guide`、`source`）。只要有这个块，解析器就只读它；`trial` / `minutes` / `demoUrl` 直接进入试用成本。没有这个块时，仍兼容各类历史 Markdown 排版。
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

## 每周数据质检

`.github/workflows/quality-weekly.yml` 每周一 09:00（北京时间）运行 `playground/quality-report.mjs`，把结果发成一个带 `data-quality` 标签的 Issue（自动关闭上一期）：

- **规则检查**（免费，总会运行）：查验覆盖率、可疑名称、无链接条目、空泛的上手步骤、疑似重复、重试队列、最近 7 天产品偏少的刊期。
- **LLM 抽检**（抽最近 25 个已查验条目）：配置了仓库 secret `COPILOT_GITHUB_TOKEN` 就用 **Copilot CLI**，每周约 1 次 Copilot 请求；否则退回 Qwen。这个 token 需要是只开了 *Copilot Requests* 权限的 fine-grained PAT。
- 想让 Copilot 动手修，可以把质检 Issue 指派给 Copilot。Copilot 云端 Agent 会开一个 PR 供审核，同样消耗 Copilot 额度。

## 合作与变现

`playground/partners.json`（手工维护）：

```json
{
  "affiliates": {
    "<productKey>": { "url": "https://…?ref=picks", "coupon": "PICKS20", "couponNote": "首月 8 折", "until": "2026-12-31" }
  },
  "sponsored": [
    { "key": "<productKey>", "from": "2026-12-01", "to": "2026-12-07", "pitch": "一句话卖点", "url": "https://…" }
  ]
}
```

- **返佣链接和优惠码**只替换出站链接，并加上「含返佣链接 · 不影响推荐与排序」或「读者专属」的披露；出站链接带 `rel="sponsored"`。
- **赞助位**在首页单独显示，标注「赞助 · 不参与推荐与排序」，同一时间最多 1 个。
- 合作信息**不会**改变排序、随机抽取、「现在就能玩」和试用成本，这一点有单元测试保证。
- **周报**：每次构建都会生成 `digest/<周>.html`（可直接用于邮件，样式全部内联）、`digest/<周>.md`（适合公众号和 newsletter 工具），以及周报 RSS `feed-weekly.xml`。站内「每周精选」页有对应入口。

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
