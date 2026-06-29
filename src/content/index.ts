import type { PopupRequest, PopupResponse } from "../shared/types";
import { ExportPanel } from "./panel";

let panel: ExportPanel | undefined;
const globalState = globalThis as typeof globalThis & { __AI_CHAT_EXPORTER_PRIVATE_READY__?: boolean };

function ensurePanel(): ExportPanel {
  panel ??= new ExportPanel();
  return panel;
}

if (!globalState.__AI_CHAT_EXPORTER_PRIVATE_READY__) {
  globalState.__AI_CHAT_EXPORTER_PRIVATE_READY__ = true;
  ensurePanel();

  chrome.runtime.onMessage.addListener((request: PopupRequest, _sender, sendResponse: (response: PopupResponse) => void) => {
    if (request.type !== "OPEN_EXPORT_PANEL") {
      sendResponse({ ok: false, message: "未知请求" });
      return false;
    }

    const activePanel = ensurePanel();
    activePanel.open();
    sendResponse({ ok: true });
    return false;
  });
}
