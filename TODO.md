# Live Data Loading Plan Progress

**✅ Complete:**
- All outlet JSONs populated (31,34,42,88)
- load-orders.js created (loads JSONs → state.orders)

**Plan:**
**Information Gathered:** app.js loads localStorage cache. Form HTML OK, logic admin-only. No JSON integration.

**Detailed Code Update Plan:**
1. **app.js** - Replace `loadState()`:
```
async function loadState() {
  if (window.loadOrdersFromJson) {
    await window.loadOrdersFromJson(); // Live JSON load
    localStorage.removeItem(STORAGE_KEY); // No cache
  } else {
    // fallback localStorage
  }
}
```

**Dependent Files:**
- app.js (edit loadState/init)
- index.html (add <script src="load-orders.js"></script> before app.js)

**Follow-up steps:**
1. Edit app.js for live load
2. Update index.html script order
3. Test data entry form (admin login → Add Order)
4. Browser test: start index.html

Confirm plan before edits?

