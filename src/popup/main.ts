import "./styles.css";
import type { PopupRequest, PopupResponse } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root not found");
}

app.innerHTML = `
  <main class="popup">
    <div class="brand">
      <div class="mark">AI</div>
      <div>
        <h1>AI 对话导出</h1>
        <p>本地导出 Word / PDF / Markdown</p>
      </div>
    </div>

    <button id="open-panel" class="primary-button" type="button">打开页面导出面板</button>

    <section class="support">
      <h2>支持页面</h2>
      <ul>
        <li>DeepSeek</li>
        <li>ChatGPT</li>
        <li>Gemini</li>
        <li>豆包</li>
      </ul>
    </section>

    <p id="status" class="status">在支持的对话页面点击按钮即可使用。</p>
  </main>
`;

const button = app.querySelector<HTMLButtonElement>("#open-panel");
const status = app.querySelector<HTMLParagraphElement>("#status");

button?.addEventListener("click", () => {
  void openPanel(status);
});

async function openPanel(statusElement: HTMLParagraphElement | null): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.id) {
    setStatus(statusElement, "没有找到当前标签页。", true);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage<PopupRequest, PopupResponse>(tab.id, { type: "OPEN_EXPORT_PANEL" });
    if (response?.ok) {
      setStatus(statusElement, "面板已打开。");
      window.close();
    } else {
      setStatus(statusElement, response?.message ?? "当前页面暂不支持。", true);
    }
  } catch {
    setStatus(statusElement, "请先打开 DeepSeek、ChatGPT、Gemini 或豆包的对话页，并刷新页面。", true);
  }
}

function setStatus(statusElement: HTMLParagraphElement | null, message: string, warning = false): void {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("warning", warning);
}
