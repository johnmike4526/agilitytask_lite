const PANEL = 'src/dashboard.html';

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL(PANEL);
  const [open] = await chrome.tabs.query({ url });
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
});
