const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwFyt5xpDWQfxKTb67mdCQoQu0sKOgQqJmLxjgIAEXjMI39tE7IJgw1nbd8Em9LoAUC/exec';

const SYNC_INTERVAL_MS = 30000; // 30 seconds
let syncInterval = null;
let lastSyncTime = null;

async function loadAllOrdersFromSheets() {
  try {
    const response = await fetch(`${SHEET_URL}?action=orders`);
    if (response.ok) {
      const result = await response.json();
      if (result.ok && Array.isArray(result.orders)) {
        state.orders = result.orders.map(normalizeOrder);
      }
    }
  } catch (error) {
    console.warn(`Failed to load from Sheets:`, error);
  }
  
  state.orders.sort((a, b) => Number(b.id) - Number(a.id));
  lastSyncTime = Date.now();
  console.log(`Loaded ${state.orders.length} orders from Google Sheets`);
  return state.orders.length;
}

async function saveAllOrdersToSheets() {
  // Refactored: Send all orders in one go, as the Google Apps Script's saveOrders_ clears the entire sheet.
  // The previous saveOutletOrders approach would lead to data loss if called for each outlet.
  try {
    const response = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncOrders', // Google Apps Script expects 'syncOrders' to replace the whole sheet
        orders: state.orders // Send all orders
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.ok) {
        console.log(`Saved ${result.saved} orders to Google Sheets`);
        return true;
      }
    }
  } catch (error) {
    console.error(`Sheet save failed:`, error);
  }
  return false;
}

function startAutoSync() {
  if (syncInterval) clearInterval(syncInterval);
  
  // Initial load
  loadAllOrdersFromSheets();
  
  // Auto-save every change (will call externally)
  // Poll load every 30s
  syncInterval = setInterval(async () => {
    await loadAllOrdersFromSheets();
    if (state.loggedIn) renderApp();
  }, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function getSyncStatus() {
  return {
    connected: !!SHEET_URL,
    lastSync: lastSyncTime ? new Date(lastSyncTime).toLocaleString('en-IN') : 'Never',
    orderCount: state.orders.length,
    pollInterval: `${SYNC_INTERVAL_MS/1000}s`
  };
}

// Export for app.js
window.SheetsSync = {
  loadAll: loadAllOrdersFromSheets,
  saveAll: saveAllOrdersToSheets,
  // saveOutlet: saveOutletOrders, // Removed as it's no longer used with the new sync strategy
  start: startAutoSync,
  stop: stopAutoSync,
  status: getSyncStatus
};
