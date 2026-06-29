# AI Chat Exporter Private

私人自用的浏览器插件，用来把当前 AI 对话导出为 Markdown、Word DOCX 或 PDF。所有处理都在浏览器本地完成，不需要服务器，不上传对话内容。

## 支持范围

- DeepSeek: `chat.deepseek.com`
- ChatGPT: `chatgpt.com` / `chat.openai.com`
- Gemini: `gemini.google.com` / `bard.google.com`
- 豆包: `doubao.com`

点击批量导出后，会先提取当前页面已经加载的消息，方便立刻勾选最近几条；同时后台继续向上滚动加载“当前会话”的历史消息。历史完整加载前不能全选，但可以逐条勾选或选择最近 2/4/6/10 条。插件不做账号级全历史扫描。

## 当前能力

- 先显示当前已加载消息，后台自动加载当前会话历史，支持取消加载。
- 历史完整后可全选；加载过程中可取消全选、逐条勾选、选择最近几条，也可按起止轮次选择范围。
- Markdown 直接下载 `.md`。
- Word 直接下载 `.docx`，优先把页面里的原始 LaTeX 转成 Word 原生公式。
- PDF 支持打印版和图片版；打印版适合复制文本，图片版适合一键直接下载。
- 可选择是否包含思考过程。

## 安装开发版

```bash
pnpm install
pnpm build
```

然后在 Edge 打开 `edge://extensions`，启用开发者模式，选择“加载解压缩的扩展”，加载本项目的 `dist` 文件夹。Chrome/Chromium 使用 `chrome://extensions`。

## 使用方式

1. 打开支持的 AI 对话页面。
2. 刷新页面，让插件内容脚本生效。
3. 点击页面右侧的 `批量导出` 浮动按钮，或点击浏览器工具栏里的插件按钮再选择打开面板。
4. 点击“批量导出”，先勾选当前已加载内容；需要全部内容时等后台加载完成后再全选。
5. 勾选消息或按起止轮次选择范围，再选择导出格式。

## 后续 AI 整理入口

代码里已经预留 `transformConversation()`。现在它是空实现，只原样返回内容；以后可以在这里接 DeepSeek、Gemini、豆包 API，或接一个小后端来保管 API Key。

## 验证

```bash
pnpm typecheck
pnpm build
pnpm smoke:math
```

`pnpm smoke:math` 会生成一个临时 DOCX 并检查 `word/document.xml` 里是否包含 `<m:oMath>`，用来确认公式不是普通文本。

## 已知限制

- 自动加载完整历史依赖各网站当前页面是否把历史消息渲染到 DOM 里；如果网站只保留可视窗口附近的消息，插件会尽量滚动加载，但仍可能受限制。
- PDF 是视觉优先方案，适合一键保存和阅读；文字可复制性不如原生排版 PDF。
- LaTeX 会尽量转成 Word 原生公式，极少数不受 KaTeX/OMML 支持的语法会回退为源码文本。

