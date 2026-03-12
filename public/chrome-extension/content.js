/**
 * CRM Carrier Portal Helper — Content Script
 *
 * On the CRM (localhost/vercel): watches for search data and writes
 * directly to chrome.storage.local.
 *
 * On carrier portals: reads from chrome.storage.local and auto-fills
 * search fields, then clicks the search/submit button.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "crm-carrier-search";
  const MAX_AGE_MS = 60000;
  const MAX_RETRIES = 30;
  const RETRY_INTERVAL_MS = 400;

  const hostname = window.location.hostname;
  const isCRM =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("vercel.app");

  // =========================================================================
  // PART 1: CRM-side — Write directly to chrome.storage.local
  // =========================================================================
  if (isCRM) {
    console.log("[CRM Helper] Content script loaded on CRM page:", hostname);

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === "CRM_CARRIER_SEARCH") {
        const data = { ...event.data.payload, timestamp: Date.now() };
        console.log("[CRM Helper] Received postMessage, storing:", data);
        chrome.storage.local.set({ "crm-carrier-search": data }, () => {
          if (chrome.runtime.lastError) {
            console.error("[CRM Helper] chrome.storage.local.set failed:", chrome.runtime.lastError);
          } else {
            console.log("[CRM Helper] Successfully stored in chrome.storage.local");
          }
        });
      }
    });

    function checkLocalStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data.timestamp || Date.now() - data.timestamp > MAX_AGE_MS) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        console.log("[CRM Helper] Found data in localStorage, storing:", data);
        chrome.storage.local.set({ "crm-carrier-search": data }, () => {
          if (chrome.runtime.lastError) {
            console.error("[CRM Helper] Storage error:", chrome.runtime.lastError);
            return;
          }
          console.log("[CRM Helper] Relayed from localStorage to chrome.storage");
          localStorage.removeItem(STORAGE_KEY);
        });
      } catch (e) {
        console.error("[CRM Helper] localStorage error:", e);
      }
    }

    checkLocalStorage();
    let polls = 0;
    const pollInterval = setInterval(() => {
      checkLocalStorage();
      if (++polls > 30) clearInterval(pollInterval);
    }, 1000);

    return;
  }

  // =========================================================================
  // PART 2: Carrier portal — Read chrome.storage and auto-fill
  // =========================================================================

  console.log("[CRM Helper] Content script loaded on carrier portal:", hostname, window.location.href);

  // Carrier-specific selector configs
  const CARRIER_CONFIGS = {
    // National General (ASP.NET WebForms) — MainMenu.aspx
    "natgenagency.com": {
      searchSelectors: [
        '#ctl00_MainContent_wgtMainMenuFindPolicy_txtSearchString',
        'input[name="ctl00$MainContent$wgtMainMenuFindPolicy$txtSearchString"]',
      ],
      nameSelectors: [],
      submitSelectors: [
        '#ctl00_MainContent_wgtMainMenuFindPolicy_btnSearch',
      ],
    },
    // Progressive
    "foragentsonly.com": {
      searchSelectors: [
        'input[name="policyNumber"]',
        'input[name="PolicyNumber"]',
        "#policyNumber",
        "#PolicyNumber",
      ],
      nameSelectors: [
        'input[name="lastName"]',
        'input[name="LastName"]',
        "#lastName",
        "#LastName",
      ],
      submitSelectors: [
        'button[type="submit"]',
        'input[type="submit"]',
        ".search-btn",
        "#searchButton",
      ],
    },
    "agent.progressive.com": {
      searchSelectors: ['input[name="policyNumber"]', "#policyNumber"],
      nameSelectors: ['input[name="lastName"]', "#lastName"],
      submitSelectors: ['button[type="submit"]'],
    },
    // Travelers
    "agentportal.travelers.com": {
      searchSelectors: [
        "#searchInput",
        'input[aria-label="Search"]',
        'input[name="policyNumber"]',
      ],
      nameSelectors: ['input[name="insuredName"]', "#insuredName"],
      submitSelectors: [".search-button", 'button[type="submit"]'],
    },
    // State Farm
    "proofing.statefarm.com": {
      searchSelectors: ['input[name="policyNumber"]', "#policySearch"],
      nameSelectors: ['input[name="customerName"]'],
      submitSelectors: ['button[type="submit"]'],
    },
    // Nationwide
    "agent.nationwide.com": {
      searchSelectors: ['input[name="policyNumber"]', "#policyNumber"],
      nameSelectors: ['input[name="lastName"]'],
      submitSelectors: ['button[type="submit"]'],
    },
    // Mercury Insurance
    "agent.mercuryinsurance.com": {
      searchSelectors: [
        'input[name="policyNumber"]',
        "#policyNumber",
        'input[name*="olicy"]',
      ],
      nameSelectors: ['input[name="lastName"]', "#lastName"],
      submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
    },
  };

  // Generic fallback selectors
  const FALLBACK_CONFIG = {
    searchSelectors: [
      'input[type="search"]',
      'input[name*="olicy" i]',
      'input[name*="search" i]',
      'input[id*="olicy" i]',
      'input[id*="search" i]',
      'input[id*="find" i]',
      'input[placeholder*="policy" i]',
      'input[placeholder*="search" i]',
      'input[aria-label*="search" i]',
      'input[aria-label*="policy" i]',
    ],
    nameSelectors: [
      'input[name*="name" i]',
      'input[name*="insured" i]',
      'input[id*="name" i]',
      'input[placeholder*="name" i]',
      'input[aria-label*="name" i]',
    ],
    submitSelectors: [
      'button[type="submit"]',
      'input[type="submit"]',
      'input[value="Search" i]',
      'button[aria-label*="search" i]',
    ],
  };

  function getConfig() {
    if (CARRIER_CONFIGS[hostname]) {
      console.log("[CRM Helper] Exact hostname match:", hostname);
      return CARRIER_CONFIGS[hostname];
    }
    for (const domain of Object.keys(CARRIER_CONFIGS)) {
      if (hostname.includes(domain) || hostname.endsWith("." + domain)) {
        console.log("[CRM Helper] Domain match:", domain, "for hostname:", hostname);
        return CARRIER_CONFIGS[domain];
      }
    }
    console.log("[CRM Helper] No carrier config found for:", hostname, "— using fallback selectors");
    return FALLBACK_CONFIG;
  }

  function findElement(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          console.log("[CRM Helper] Found visible element:", sel, "->", el.tagName, el.id || el.name || "");
          return el;
        }
      } catch {
        // skip invalid selector
      }
    }
    // Second pass: allow hidden elements (some ASP.NET elements have offsetParent=null)
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          console.log("[CRM Helper] Found element (may be hidden):", sel, "->", el.tagName, el.id || el.name || "");
          return el;
        }
      } catch {
        // skip
      }
    }
    console.log("[CRM Helper] No element found. Tried:", selectors.join(", "));
    return null;
  }

  function fillInput(input, value) {
    input.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    console.log("[CRM Helper] Filled input:", input.id || input.name, "with value:", value);
  }

  function showNotification(message, type) {
    const existing = document.getElementById("crm-carrier-helper-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "crm-carrier-helper-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 999999;
      padding: 12px 20px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; font-weight: 500; color: white;
      background: ${type === "success" ? "#16a34a" : type === "info" ? "#7c3aed" : "#dc2626"};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease; opacity: 1;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function attemptFill(data, retries) {
    const config = getConfig();
    const searchInput = findElement(config.searchSelectors);

    if (searchInput) {
      const value = data.policyNumber || data.contactName;
      fillInput(searchInput, value);

      if (data.contactName && data.policyNumber && config.nameSelectors.length) {
        const nameInput = findElement(config.nameSelectors);
        if (nameInput && nameInput !== searchInput) {
          fillInput(nameInput, data.contactName);
        }
      }

      showNotification(
        `Auto-filled: ${data.policyNumber ? "#" + data.policyNumber : data.contactName} (${data.carrierName})`,
        "success"
      );

      // Clear the stored data so it doesn't fire again
      chrome.storage.local.remove("crm-carrier-search", () => {
        console.log("[CRM Helper] Cleared search data from storage");
      });

      // Auto-click the search/submit button after a short delay
      setTimeout(() => {
        console.log("[CRM Helper] Looking for submit button...");
        const submitBtn = findElement(config.submitSelectors);
        if (submitBtn) {
          console.log("[CRM Helper] Found submit:", submitBtn.tagName, submitBtn.id || "");

          // ASP.NET uses <a href="javascript:__doPostBack(...)"> which CSP blocks
          // from extension context. Replicate __doPostBack by setting hidden fields
          // and submitting the form directly.
          if (submitBtn.tagName === "A" && submitBtn.href && submitBtn.href.includes("__doPostBack")) {
            const match = submitBtn.href.match(/__doPostBack\('([^']+)','([^']*)'\)/);
            if (match) {
              const eventTarget = match[1];
              const eventArg = match[2];
              console.log("[CRM Helper] Simulating __doPostBack:", eventTarget, eventArg);

              // __doPostBack sets these hidden fields then submits the form
              const form = document.getElementById("aspnetForm") || document.forms[0];
              const etField = document.getElementById("__EVENTTARGET");
              const eaField = document.getElementById("__EVENTARGUMENT");

              if (form && etField && eaField) {
                etField.value = eventTarget;
                eaField.value = eventArg;
                form.submit();
              } else {
                console.error("[CRM Helper] Could not find ASP.NET form or hidden fields");
              }
            }
          } else {
            submitBtn.click();
          }
        } else {
          console.log("[CRM Helper] No submit button found — user can click manually");
        }
      }, 500);

      return;
    }

    if (retries < MAX_RETRIES) {
      if (retries % 5 === 0) {
        console.log("[CRM Helper] Retry", retries + "/" + MAX_RETRIES, "— waiting for search field...");
      }
      setTimeout(() => attemptFill(data, retries + 1), RETRY_INTERVAL_MS);
    } else {
      console.log("[CRM Helper] Gave up after", MAX_RETRIES, "retries");
      showNotification(
        `Could not find search field. "${data.policyNumber || data.contactName}" is in your clipboard.`,
        "info"
      );
      chrome.storage.local.remove("crm-carrier-search");
    }
  }

  // Main: read directly from chrome.storage.local (no background relay needed)
  function init() {
    console.log("[CRM Helper] init() — reading chrome.storage.local directly...");
    chrome.storage.local.get("crm-carrier-search", (result) => {
      if (chrome.runtime.lastError) {
        console.error("[CRM Helper] Error reading storage:", chrome.runtime.lastError);
        return;
      }
      const data = result["crm-carrier-search"];
      if (!data) {
        console.log("[CRM Helper] No search data in storage");
        return;
      }

      const age = Math.round((Date.now() - data.timestamp) / 1000);
      console.log("[CRM Helper] Found search data:", data, "age:", age + "s");

      if (!data.timestamp || Date.now() - data.timestamp > MAX_AGE_MS) {
        console.log("[CRM Helper] Data expired, clearing");
        chrome.storage.local.remove("crm-carrier-search");
        return;
      }

      attemptFill(data, 0);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(init, 500);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  }
})();
