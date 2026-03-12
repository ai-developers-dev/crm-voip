/**
 * CRM Carrier Portal Helper — Background Service Worker
 *
 * Listens for messages from the CRM content script (running on localhost/vercel)
 * and stores search data in chrome.storage.local so the carrier portal
 * content script can read it (localStorage is per-origin and can't be shared).
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CRM_CARRIER_SEARCH") {
    // Store the search data with a timestamp
    const data = {
      ...message.data,
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ "crm-carrier-search": data }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async sendResponse
  }

  if (message.type === "CRM_CARRIER_SEARCH_GET") {
    chrome.storage.local.get("crm-carrier-search", (result) => {
      sendResponse({ data: result["crm-carrier-search"] || null });
    });
    return true;
  }

  if (message.type === "CRM_CARRIER_SEARCH_CLEAR") {
    chrome.storage.local.remove("crm-carrier-search", () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
