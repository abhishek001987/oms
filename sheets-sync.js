const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwFyt5xpDWQfxKTb67mdCQoQu0sKOgQqJmLxjgIAEXjMI39tE7IJgw1nbd8Em9LoAUC/exec';

const SYNC_INTERVAL_MS = 30000; // 30 seconds
let syncInterval = null;
let lastSyncTime = null;

async function loadAllOrdersFromSheets() {
  const outlets = ['Outlet 31', 'Outlet 34', 'Outlet 42', 'Outlet 88'];
  state.orders = [];
  
  for (const outletName of outlets) {
    try {
      const response = await fetch(`${SHEET_URL}?action=getOutletOrders&amp;outlet=${encodeURIComponent(outletName)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.ok) {
          const outletOrders = (result.orders || []).map(normalizeOrder);
          state.orders.push(...outletOrders.map(order => ({...order, outlet: outletName})));
        }
      }
    } catch (error) {
      console.warn(`Failed to load ${outletName} from Sheets:`, error);
    }
  }
  
  state.orders.sort((a, b) => Number(b.id) - Number(a.id));
  lastSyncTime = Date.now();
  console.log(`Loaded ${state.orders.length} orders from Google Sheets`);
  return state.orders.length;
}

async function saveOutletOrders(outletName) {
  const outletOrders = state.orders.filter(order => order.outlet === outletName);
  try {
    const response = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncOutletOrders',
        outlet: outletName,
        orders: outletOrders
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.ok) {
        console.log(`Saved ${result.saved} orders for ${outletName} to Sheets`);
        return true;
      }
    }
  } catch (error) {
    console.error(`Sheet save failed for ${outletName}:`, error);
  }
  return false;
}

async function saveAllOrdersToSheets() {
  const outlets = [...new Set(state.orders.map(o => o.outlet))];
  let successCount = 0;
  
  for (const outletName of outlets) {
    if (await saveOutletOrders(outletName)) successCount++;
  }
  
  return successCount === outlets.length;
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
  saveOutlet: saveOutletOrders,
  start: startAutoSync,
  stop: stopAutoSync,
  status: getSyncStatus
};

