# Products Selection · 每日精选产品体验台

> **Muse 买手店 × Agent A 全景雷达** 双源精选产品体验台，支持按产品类型分类浏览、右侧分屏完整阅读 GitHub README、网页在线试玩，以及通过 **GitHub Key + GitHub Codespaces** 启动真实云端容器上手体验开源项目。

## 核心特性

1. **双源精选与按产品类型分类**：
   - 汇聚 70+ 期每日精选简报，自动合并同日被 Muse 与 Agent A 同时命中的「双源精选」产品。
   - 按产品类型清晰划分：`Agent 与自动化`、`开发与基础设施`、`效率与桌面工具`、`AI 模型与多模态`、`垂直与行业应用`。
2. **右侧真分屏体验台（支持拖拽宽度）**：
   - **📖 README / 产品详解**：直读完整 Markdown `README.md`（支持表格、代码块一键复制、相对路径图片自动解析）与提取的快速安装命令；无 GitHub 仓库时展示官网核心摘要。
   - **🚀 Codespace 真机体验**：配置你的 GitHub Personal Access Token（需勾选 `codespace` + `repo` 权限）后，即可直接在网页内为任意开源项目**创建、启动、停止、销毁 GitHub Codespaces 云端容器**，打开云端 Web IDE 或本地 VS Code，并支持一键生成端口转发预览地址（如 `3000`/`5173`/`8000`）。
   - **🌐 网页在线试玩**：支持网页内嵌体验；本地运行时自动提供本地代理模式绕过 `X-Frame-Options` / `CSP` 防嵌套限制。
3. **双模式运行（本地工作台 + GitHub Pages 静态部署）**：
   - **在线访问**：通过 GitHub Pages 部署 `playground/public/`，配合浏览器内配置 GitHub Key 即可直接驱动 GitHub API 与 Codespaces。
   - **本地运行**：支持实时读取本地 Markdown 简报、一键同步 Muse 仓库、本地代理网页预览、以及在 macOS 上直接打开 `Terminal.app` 克隆试跑。

---

## 本地启动方式

需要 Node.js >= 20（已验证于 Node v22）。

```bash
# 1. 重新编译静态数据集（当有新简报加入时运行）
node playground/build-static.mjs

# 2. 启动本地分屏体验台服务
node playground/server.mjs
```

启动后在浏览器访问：`http://127.0.0.1:4321`

## 如何配置 GitHub Key 使用 Codespaces 真机体验

1. 点击网页右上角的 **「配置 GitHub Key」** 按钮（或在任意开源产品的 **「🚀 Codespace 真机体验」** 标签页内）。
2. 点击弹窗中的 **「一键前往 GitHub 生成 Token」** 链接（自动预填 `codespace`、`repo`、`read:user` 权限）。
3. 将生成的 `ghp_...` 或 `github_pat_...` 粘贴保存即可（Token 仅存储在当前浏览器 `localStorage` 中，直接请求 `api.github.com`）。
