// SPDX-License-Identifier: MIT
// The toolbar button opens the converter in a tab. Opening a tab of the
// extension's own page needs no permission.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("convert.html") });
});
