// Load all outlet JSONs and populate state.orders
async function loadOrdersFromJson() {
  const outlets = ['31', '34', '42', '88'];
  state.orders = [];
  
  for (const outlet of outlets) {
    try {
      const response = await fetch(`outlet-${outlet}.json`);
      if (response.ok) {
        const outletOrders = await response.json();
        state.orders.push(...outletOrders.map(order => normalizeOrder(order)));
      }
    } catch (error) {
      console.warn(`Failed to load outlet-${outlet}.json:`, error);
    }
  }
  
  state.orders.sort((a, b) => Number(b.id) - Number(a.id)); // Newest first
  console.log(`Loaded ${state.orders.length} total orders from JSONs`);
}

// Export for app.js
window.loadOrdersFromJson = loadOrdersFromJson;

