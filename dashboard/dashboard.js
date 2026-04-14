function renderDashboardView() { // Renamed to avoid conflict with app.js and clarify its role
  const search = controls.dashboardSearch?.value.toLowerCase() || ''; // Added optional chaining and default
  const statusFilter = controls.dashboardStatus?.value || 'all'; // Added optional chaining and default
  const activeTab = state.dashboardTab || 'today';
  const visibleOrders = getVisibleOrders();
  const selectedOrders = getDashboardOrdersByTab(visibleOrders, activeTab)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id));
  const filtered = selectedOrders.filter(order => {
    const matchSearch = [order.id, order.customer, order.mobile, order.item, order.outlet]
      .some(value => String(value).toLowerCase().includes(search));
    const matchStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (typeof updateDashboardTabButtons === 'function') updateDashboardTabButtons(); // Ensure function exists
  if (controls.dashboardTabCount) controls.dashboardTabCount.textContent = filtered.length;
  if (controls.dashboardTabLabel) controls.dashboardTabLabel.textContent = getDashboardTabLabel(activeTab);
  
  const emptyMessage = selectedOrders.length
    ? 'No matching orders found.'
    : `No ${getDashboardTabLabel(activeTab)} orders yet.`;

  controls.dashboardOrderList.innerHTML = filtered.map(orderCardHtml).join('') || `<p class="empty-state">${emptyMessage}</p>`;
  if (typeof renderSummary === 'function') renderSummary();

  // Removed pageSubtitle manipulation as it's handled by app.js switchView
  // if (isOutletUser()) {
  //   pageSubtitle.textContent = `Orders for ${state.currentUser.outlet}`;
  // } else {
  //   pageSubtitle.textContent = 'Manage all outlets and orders from one place.';
  // }
}

function orderCardHtml(order) {
  const statusOptions = ['Preparing', 'Ready', 'OutForDelivery', 'Delivered'];
  return `
    <div class="order-card">
      <div class="order-row">
        <div>
          <h4>#${order.id} — ${order.item}</h4>
          <select class="status-select status-pill ${order.status}" data-action="status" data-id="${order.id}">
            ${statusOptions.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </div>
        <div>${formatCurrency(order.amount)}</div>
      </div>
      <div class="order-meta">
        <p><strong>Customer:</strong> ${order.customer || '—'}</p>
        <p><strong>Mobile:</strong> ${order.mobile}</p>
        <p><strong>Outlet:</strong> ${order.outlet}</p>
        <p><strong>Delivery:</strong> ${order.deliveryDate} ${order.deliveryTime}</p>
      </div>
      <div class="order-actions">
        <button data-action="edit" data-id="${order.id}">Open Order</button>
        <button data-action="delete" data-id="${order.id}">Delete</button>
      </div>
    </div>
  `;
}

function getDashboardOrdersByTab(orders, tab) {
  const today = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
  if (tab === 'today') {
    return orders.filter(order => order.status !== 'Delivered' && order.deliveryDate === today);
  }
  if (tab === 'tomorrow') {
    return orders.filter(order => order.status !== 'Delivered' && order.deliveryDate === tomorrow);
  }
  if (tab === 'future') {
    return orders.filter(order => order.status !== 'Delivered' && order.deliveryDate > tomorrow);
  }
  if (tab === 'delivered') {
    return orders.filter(order => order.status === 'Delivered');
  }
  return orders;
}

function getDashboardTabLabel(tab) {
  return {
    today: 'Today',
    tomorrow: 'Tomorrow',
    future: 'Future',
    delivered: 'Delivered'
  }[tab] || tab;
}

function getDashboardTabCounts(orders) {
  return {
    today: getDashboardOrdersByTab(orders, 'today').length,
    tomorrow: getDashboardOrdersByTab(orders, 'tomorrow').length,
    future: getDashboardOrdersByTab(orders, 'future').length,
    delivered: getDashboardOrdersByTab(orders, 'delivered').length,
  };
}

function updateDashboardTabButtons() {
  if (controls.dashboardTabs) { // Added null check for controls.dashboardTabs
    const counts = getDashboardTabCounts(getVisibleOrders());
    controls.dashboardTabs.forEach(button => {
      const tab = button.dataset.tab;
      button.textContent = `${getDashboardTabLabel(tab)} (${counts[tab] || 0})`;
      button.classList.toggle('active', tab === state.dashboardTab);
    });
  }
}

function updateDashboardTab(selectedTab) {
  state.dashboardTab = selectedTab;
  controls.dashboardTabs.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === selectedTab);
  });
  renderDashboardView();
}
