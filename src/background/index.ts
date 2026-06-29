const SUPPORTED_URLS = [
  "https://chat.deepseek.com/*",
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://gemini.google.com/*",
  "https://bard.google.com/*",
  "https://www.doubao.com/*",
  "https://doubao.com/*"
];

chrome.runtime.onInstalled.addListener(() => {
  void injectIntoOpenSupportedTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void injectIntoOpenSupportedTabs();
});

async function injectIntoOpenSupportedTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: SUPPORTED_URLS });

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets/content.js"]
        });
      } catch {
        // Some tabs are not scriptable yet, for example unloaded or restricted tabs.
      }
    })
  );
}
