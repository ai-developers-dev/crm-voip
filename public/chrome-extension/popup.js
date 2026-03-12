document.addEventListener("DOMContentLoaded", () => {
  const pendingEl = document.getElementById("pending");
  const debugEl = document.getElementById("debug-info");

  chrome.storage.local.get("crm-carrier-search", (result) => {
    const data = result["crm-carrier-search"];

    // Always show debug info
    if (debugEl) {
      if (data) {
        const age = Math.round((Date.now() - data.timestamp) / 1000);
        debugEl.innerHTML = `
          <div class="debug-data">
            <div><strong>Raw storage:</strong></div>
            <div>Policy: "${data.policyNumber || "(empty)"}"</div>
            <div>Name: "${data.contactName || "(empty)"}"</div>
            <div>Carrier: "${data.carrierName || "(empty)"}"</div>
            <div>Age: ${age}s ago</div>
            <div>Expired: ${age > 60 ? "YES" : "no"}</div>
          </div>
        `;
      } else {
        debugEl.innerHTML = '<div class="debug-data">No data in chrome.storage.local</div>';
      }
    }

    if (data && data.timestamp && Date.now() - data.timestamp < 60000) {
      const policyText = data.policyNumber
        ? `<strong style="font-size:16px;color:#7c3aed">#${data.policyNumber}</strong>`
        : "";
      const nameText = data.contactName
        ? `<div style="margin-top:2px">Name: ${data.contactName}</div>`
        : "";

      pendingEl.innerHTML = `
        <div class="pending-data">
          <strong>${data.carrierName || "Unknown Carrier"}</strong>
          ${policyText}
          ${nameText}
          <div style="margin-top:6px;font-size:11px;color:#92400e">
            Waiting to auto-fill on carrier portal...
          </div>
        </div>
      `;
    } else if (data) {
      pendingEl.innerHTML = '<div class="no-data">Last search expired. Click a carrier in your CRM to start a new one.</div>';
    } else {
      pendingEl.innerHTML = '<div class="no-data">No pending search. Click a carrier in your CRM to start.</div>';
    }
  });
});
