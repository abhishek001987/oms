const sampleOutlets = [
  { name: "Outlet 31" },
  { name: "Outlet 34" },
  { name: "Outlet 42" },
  { name: "Outlet 88" }
];

const samplePartners = [];

const DATA_VERSION = "whatsbake-v6-sheets";
const AUTH_KEY = "whatsbake-auth-v5";
const STORAGE_KEY = "whatsbake-data-v6";
const ADMIN_PASSWORD = "Admin@2026!";
const OUTLET_PASSWORDS = {
  "Outlet 31": "Outlet31!2026",
  "Outlet 34": "Outlet34!2026",
  "Outlet 42": "Outlet42!2026",
  "Outlet 88": "Outlet88!2026"
};

const ORDER_STATUSES = ["Preparing", "Ready", "OutForDelivery", "Delivered", "Delayed"];
const PRIORITY_ORDER = { Critical: 0, High: 1, Normal: 2, Low: 3 };
const ALLOWED_OUTLET_VIEWS = new Set(["dashboard", "delivery", "outlets", "reports"]);
const REMINDER_MINUTES = [60, 30];
const REMINDER_CHECK_INTERVAL_MS = 15000;
const SUPPORT_PHONE_PRIMARY = "9266424088";
const SUPPORT_PHONE_SECONDARY = "9971860845";
const GOOGLE_APPS_SCRIPT_TEMPLATE = String.raw`function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "health";
  if (action === "health") {
    return jsonOutput({ ok: true, message: "Broomies sync is live" });
  }
  if (action === "orders") {
    return jsonOutput({ ok: true, orders: getOrders_() });
  }
  return jsonOutput({ ok: false, error: "Invalid action" });
}

function doPost(e) {
  const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  const action = payload.action || "";
  if (action === "syncOrders") {
    saveOrders_(payload.orders || []);
    return jsonOutput({ ok: true, saved: (payload.orders || []).length });
  }
  if (action === "appendOrder") {
    appendOrder_(payload.order || {});
    return jsonOutput({ ok: true });
  }
  return jsonOutput({ ok: false, error: "Invalid action" });
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Orders");
  if (!sheet) {
    sheet = ss.insertSheet("Orders");
    sheet.appendRow(["id","customer","mobile","outlet","item","quantity","amount","paymentType","paymentStatus","status","deliveryType","priority","orderDate","orderTime","deliveryDate","deliveryTime","assignedPartnerId","informedBy","address","fullAddress","remark","cash","online","createdAt","updatedAt","deliveredAt"]);
  }
  return sheet;
}

function getOrders_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function(row) {
    const item = {};
    headers.forEach(function(header, index) {
      item[header] = row[index];
    });
    return item;
  });
}

function saveOrders_(orders) {
  const sheet = getSheet_();
  sheet.clearContents();
  const headers = ["id","customer","mobile","outlet","item","quantity","amount","paymentType","paymentStatus","status","deliveryType","priority","orderDate","orderTime","deliveryDate","deliveryTime","assignedPartnerId","informedBy","address","fullAddress","remark","cash","online","createdAt","updatedAt","deliveredAt"];
  sheet.appendRow(headers);
  orders.forEach(function(order) {
    sheet.appendRow(headers.map(function(header) {
      return order[header] || "";
    }));
  });
}

function appendOrder_(order) {
  const sheet = getSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(function(header) {
    return order[header] || "";
  }));
}`;

const state = {
  orders: [],
  outlets: [],
  partners: [],
  nextOrderId: 1,
  currentView: "dashboard",
  dashboardTab: "today",
  loggedIn: false,
  role: null,
  outletName: null,
  pendingOutlet: null,
  filterOpen: false,
  detailEditing: false,
  pendingWhatsappOrderId: null
};

const controls = {};
let notificationAudioContext = null;
let notificationOscillator = null;
let notificationGain = null;
let notificationToneInterval = null;
let reminderTimer = null;
const reminderQueue = [];
let reportFilteredOrders = [];

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function $(id) {
  return document.getElementById(id);
}

function initControls() {
  controls.loginScreen = $("login-screen");
  controls.appShell = $("app-shell");
  controls.adminSelect = $("admin-select") || document.querySelector('[data-user="admin"]');
  controls.outletSelect = $("outlet-select") || document.querySelector('.outlet-grid');
  controls.passwordModal = $("admin-password-modal");
  if (controls.passwordModal) {
    controls.passwordTitle = controls.passwordModal.querySelector("h2");
  }
  controls.passwordInput = $("admin-password-input");
  controls.passwordSubmit = $("admin-password-submit");
  controls.passwordCancel = $("admin-password-cancel");
  controls.loginPanel = $("login-panel");
  controls.outletSelection = $("outlet-selection");
  controls.outletBack = $("outlet-back");
  controls.outletCards = document.querySelectorAll(".outlet-login-card");

  controls.menuToggle = $("menu-toggle");
  controls.sidebarBackdrop = $("sidebar-backdrop");
  controls.exportButton = $("export-button");
  controls.filterButton = $("filter-button");
  controls.filterPanel = $("dashboard-filter-panel");
  controls.navItems = document.querySelectorAll(".nav-item");
  controls.views = document.querySelectorAll(".view");
  controls.adminOnly = document.querySelectorAll(".role-admin-only");

  controls.pageTitle = $("page-title");
  controls.pageSubtitle = $("page-subtitle");
  controls.sidebarDelivered = $("sidebar-delivered-count");
  controls.userName = document.querySelector(".sidebar-user strong");
  controls.userStatus = document.querySelector(".sidebar-user p");

  controls.dashboardSearch = $("dashboard-search");
  controls.dashboardStatus = $("dashboard-status-filter");
  controls.dashboardOutlet = $("dashboard-outlet-filter");
  controls.dashboardTabs = document.querySelectorAll(".dashboard-tab");
  controls.dashboardOrderList = $("dashboard-order-list");
  controls.workflowBoard = $("workflow-board");
  controls.riskList = $("risk-list");
  controls.riskCountBadge = $("risk-count-badge");

  controls.statTotal = $("stat-total");
  controls.statPreparing = $("stat-preparing");
  controls.statReady = $("stat-ready");
  controls.statDelivery = $("stat-delivery");
  controls.statDelivered = $("stat-delivered");
  controls.statRisk = $("stat-risk");

  controls.orderForm = $("order-form");
  controls.orderNumber = $("order-number");
  controls.orderOutlet = $("order-outlet");
  controls.orderCustomer = $("order-customer");
  controls.orderAmount = $("order-amount");
  controls.orderDate = $("order-date");
  controls.orderTimeHour = $("order-time-hour");
  controls.orderTimeMinute = $("order-time-minute");
  controls.orderTimeAmpm = $("order-time-ampm");
  controls.orderItem = $("order-item");
  controls.orderQuantity = $("order-quantity");
  controls.orderMobile = $("order-mobile");
  controls.orderDeliveryType = $("order-delivery-type");
  controls.orderInformedBy = $("order-informed-by");
  controls.orderAddress = $("order-address");
  controls.orderDeliveryDate = $("order-delivery-date");
  controls.orderDeliveryTimeHour = $("order-delivery-time-hour");
  controls.orderDeliveryTimeMinute = $("order-delivery-time-minute");
  controls.orderDeliveryTimeAmpm = $("order-delivery-time-ampm");
  controls.orderFullAddress = $("order-full-address");
  controls.orderRemark = $("order-remark");
  controls.orderPaymentType = $("order-payment-type");
  controls.orderPaymentStatus = $("order-payment-status");
  controls.orderPriority = $("order-priority");
  controls.orderPartner = $("order-partner");
  controls.partPaymentFields = $("part-payment-fields");
  controls.orderCash = $("order-cash");
  controls.orderOnline = $("order-online");

  controls.deliverySummary = $("delivery-summary");
  controls.deliveryOutlet = $("delivery-outlet-filter");
  controls.deliveryStatus = $("delivery-status-filter");
  controls.deliveryOrderList = $("delivery-order-list");

  controls.outletSummary = $("outlet-summary");
  controls.outletTableBody = $("outlet-table-body");
  controls.partnerList = $("partner-list");

  controls.reportOrderFrom = $("report-order-from");
  controls.reportOrderTo = $("report-order-to");
  controls.reportDeliveryFrom = $("report-delivery-from");
  controls.reportDeliveryTo = $("report-delivery-to");
  controls.reportOutlet = $("report-outlet");
  controls.reportStatus = $("report-status");
  controls.reportPaymentType = $("report-payment-type");
  controls.reportDeliveryType = $("report-delivery-type");
  controls.reportDelayOrders = $("report-delay-orders");
  controls.reportFilter = $("report-filter");
  controls.reportTotal = $("report-total");
  controls.reportRevenue = $("report-revenue");
  controls.reportPending = $("report-pending");
  controls.reportOnTime = $("report-on-time");
  controls.reportLate = $("report-late");
  controls.reportTableBody = $("report-table-body");
  controls.reportExportCsv = $("report-export-csv");
  controls.reportExportPdf = $("report-export-pdf");
  controls.reportExportExcel = $("report-export-excel");
  controls.outletPieChart = $("outlet-pie-chart");
  controls.statusPieChart = $("status-pie-chart");
  controls.paymentPieChart = $("payment-pie-chart");
  controls.outletPieLegend = $("outlet-pie-legend");
  controls.statusPieLegend = $("status-pie-legend");
  controls.paymentPieLegend = $("payment-pie-legend");
  controls.statusChart = $("status-chart");
  controls.outletRevenueChart = $("outlet-revenue-chart");

  controls.outletReportPanel = $("outlet-report-panel");
  controls.outletReportTotal = $("outlet-report-total");
  controls.outletReportRevenue = $("outlet-report-revenue");
  controls.outletReportPending = $("outlet-report-pending");

  controls.orderDetailModal = $("order-detail-modal");
  controls.orderDetailClose = $("order-detail-close");
  controls.orderDetailTitle = $("detail-order-title");
  controls.orderDetailCustomer = $("detail-customer");
  controls.orderDetailCustomerInput = $("detail-customer-input");
  controls.orderDetailMobile = $("detail-mobile");
  controls.orderDetailMobileInput = $("detail-mobile-input");
  controls.orderDetailOutlet = $("detail-outlet");
  controls.orderDetailAmount = $("detail-amount");
  controls.orderDetailAmountInput = $("detail-amount-input");
  controls.orderDetailItem = $("detail-item");
  controls.orderDetailItemInput = $("detail-item-input");
  controls.orderDetailQuantity = $("detail-quantity");
  controls.orderDetailQuantityInput = $("detail-quantity-input");
  controls.orderDetailType = $("detail-delivery-type");
  controls.orderDetailDeliveryTypeInput = $("detail-delivery-type-input");
  controls.orderDetailOrderDate = $("detail-order-date");
  controls.orderDetailOrderDateInput = $("detail-order-date-input");
  controls.orderDetailOrderTime = $("detail-order-time");
  controls.orderDetailOrderTimeHour = $("detail-order-time-hour");
  controls.orderDetailOrderTimeMinute = $("detail-order-time-minute");
  controls.orderDetailOrderTimeAmpm = $("detail-order-time-ampm");
  controls.orderDetailDate = $("detail-date");
  controls.orderDetailDateInput = $("detail-date-input");
  controls.orderDetailTime = $("detail-time");
  controls.orderDetailTimeHour = $("detail-time-hour");
  controls.orderDetailTimeMinute = $("detail-time-minute");
  controls.orderDetailTimeAmpm = $("detail-time-ampm");
  controls.orderDetailPriority = $("detail-priority");
  controls.orderDetailPriorityInput = $("detail-priority-input");
  controls.orderDetailPaymentStatus = $("detail-payment-status");
  controls.orderDetailPaymentStatusInput = $("detail-payment-status-input");
  controls.orderDetailPartner = $("detail-partner");
  controls.orderDetailPartnerInput = $("detail-partner-input");
  controls.orderDetailInfo = $("detail-info");
  controls.orderDetailInfoInput = $("detail-info-input");
  controls.orderDetailStatus = $("detail-status");
  controls.orderDetailStatusLabel = $("detail-status-label");
  controls.orderDetailSave = $("detail-save-button");
  controls.orderDetailEdit = $("detail-edit-button");
  controls.orderDetailDelete = $("detail-delete-button");
  controls.orderDetailStatusSelectContainer = $("detail-status-select-container");
  controls.orderDetailStatusLabelContainer = $("detail-status-label-container");

  controls.notificationModal = $("delivery-notification");
  controls.notificationMessage = $("delivery-notification-message");
  controls.notificationOk = $("delivery-notification-ok");

  controls.sheetUrl = $("sheet-url");
  controls.sheetSave = $("sheet-save");
  controls.sheetSync = $("sheet-sync");
  controls.sheetStatus = $("sheet-status");
  controls.sheetScriptCode = $("sheet-script-code");
  controls.sheetScriptCopy = $("sheet-script-copy");

  controls.whatsappModal = $("whatsapp-confirmation-modal");
  controls.whatsappClose = $("whatsapp-confirmation-close");
  controls.whatsappCancel = $("whatsapp-confirmation-cancel");
  controls.whatsappSend = $("whatsapp-confirmation-send");
  controls.whatsappCustomerName = $("whatsapp-customer-name");
  controls.whatsappCustomerNumber = $("whatsapp-customer-number");
  controls.whatsappMessagePreview = $("whatsapp-message-preview");

  controls.logoutButton = $("logout-button");
  controls.topbarLogoutButton = $("topbar-logout-button");
  controls.toast = $("app-toast");
}

function initListeners() {
  // Navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchView(item.dataset.view);
      closeSidebar();
    });
  });

  // Login Event Delegation (More stable)
  document.addEventListener("click", (e) => {
    const adminBtn = e.target.closest("#admin-select") || (e.target.dataset?.user === 'admin' ? e.target : null);
    const outletCard = e.target.closest(".outlet-login-card");
    
    if (adminBtn) openAdminPassword();
    if (outletCard) openOutletPassword(outletCard.dataset.outlet);
  });

  if (controls.outletSelect) {
     controls.outletSelect.addEventListener("click", (e) => {
       if(e.target.classList.contains('outlet-login-card')) showOutletSelection();
     });
  }

  if (controls.outletBack) controls.outletBack.addEventListener("click", showLoginPanel);
  if (controls.passwordSubmit) controls.passwordSubmit.addEventListener("click", handlePasswordSubmit);
  if (controls.passwordCancel) controls.passwordCancel.addEventListener("click", closePasswordModal);
  
  // ... existing listeners with safety checks ...
  if (controls.menuToggle) controls.menuToggle.addEventListener("click", toggleSidebar);
  if (controls.sidebarBackdrop) controls.sidebarBackdrop.addEventListener("click", closeSidebar);
  if (controls.logoutButton) controls.logoutButton.addEventListener("click", logout);
  if (controls.topbarLogoutButton) controls.topbarLogoutButton.addEventListener("click", logout);

  controls.filterButton?.addEventListener("click", () => {
    state.filterOpen = !state.filterOpen;
    controls.filterPanel.classList.toggle("hidden", !state.filterOpen);
  });
  if (controls.exportButton) controls.exportButton.addEventListener("click", exportCurrentOrders);

  controls.dashboardSearch?.addEventListener("input", debounce(renderDashboard, 300));
  controls.dashboardStatus?.addEventListener("change", renderDashboard);
  controls.dashboardOutlet?.addEventListener("change", renderDashboard);
  
  if (controls.dashboardTabs) {
    controls.dashboardTabs.forEach((button) => {
      button.addEventListener("click", () => {
        state.dashboardTab = button.dataset.tab;
        // Sync with dashboard.js logic
        if (typeof updateDashboardTab === 'function') {
          updateDashboardTab(state.dashboardTab);
        } else {
          renderDashboard();
        }
      });
    });
  }

  controls.orderPaymentType.addEventListener("change", updatePaymentFields);
  controls.orderForm.addEventListener("submit", handleOrderSubmit);
  controls.orderForm.addEventListener("reset", () => {
    window.setTimeout(prepareOrderForm, 0);
  });

  controls.deliveryOutlet.addEventListener("change", renderDelivery);
  controls.deliveryStatus.addEventListener("change", renderDelivery);

  controls.reportFilter.addEventListener("click", renderReports);
  controls.reportExportCsv.addEventListener("click", exportReportsCsv);
  controls.reportExportPdf.addEventListener("click", exportReportsPdf);
  controls.reportExportExcel.addEventListener("click", exportReportsExcel);

  controls.dashboardOrderList.addEventListener("click", handleOrderListClick);
  controls.dashboardOrderList.addEventListener("change", handleStatusSelectChange);
  controls.deliveryOrderList.addEventListener("click", handleOrderListClick);
  controls.riskList.addEventListener("click", handleOrderListClick);
  controls.workflowBoard.addEventListener("click", handleOrderListClick);

  controls.orderDetailClose.addEventListener("click", closeOrderDetail);
  controls.orderDetailEdit.addEventListener("click", toggleOrderDetailEdit);
  controls.orderDetailSave.addEventListener("click", saveOrderDetail);
  controls.orderDetailDelete.addEventListener("click", handleOrderDelete);

  controls.notificationOk.addEventListener("click", closeDeliveryNotification);
  controls.sheetSave.addEventListener("click", saveSheetUrl);
  controls.sheetSync.addEventListener("click", syncSheetSnapshot);
  controls.sheetScriptCopy.addEventListener("click", copySheetScript);
  controls.whatsappClose.addEventListener("click", closeWhatsappConfirmation);
  controls.whatsappCancel.addEventListener("click", closeWhatsappConfirmation);
  controls.whatsappSend.addEventListener("click", launchWhatsappConfirmation);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOrderDetail();
      closePasswordModal();
      closeSidebar();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && state.loggedIn) {
      event.preventDefault();
      exportCurrentOrders();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && state.loggedIn) {
      event.preventDefault();
      controls.filterButton.click();
    }
  });
}

async function loadState() {
  const version = localStorage.getItem("whatsbake-version");
  if (version !== DATA_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTH_KEY);
    localStorage.setItem("whatsbake-version", DATA_VERSION);
  }

  // Restore Auth Session first
  const savedAuth = localStorage.getItem(AUTH_KEY);
  if (savedAuth) {
    try {
      const auth = JSON.parse(savedAuth);
      state.loggedIn = auth.loggedIn || false;
      state.role = auth.role || null;
      state.outletName = auth.outletName || null;
    } catch (e) {
      console.error("Auth restore failed", e);
    }
  }

  // Google Sheets LIVE LOAD
  if (typeof window.SheetsSync?.loadAll === 'function') {
    const count = await window.SheetsSync.loadAll();
    console.log(`Loaded ${count} live orders from Google Sheets`);
  } else {
    // Fallback to local storage if Sheets fails
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      state.orders = (parsed.orders || []).map(normalizeOrder);
    } else {
      hydrateSampleState();
    }
  }

  state.outlets = sampleOutlets.map((outlet) => ({ ...outlet }));
  state.partners = samplePartners.map((partner) => ({ ...partner }));
  state.nextOrderId = getNextOrderId(state.orders);
}

function hydrateSampleState() {
  const bootstrapOrders = Array.isArray(window.APP_SAMPLE_ORDERS) ? window.APP_SAMPLE_ORDERS : [];
  state.orders = bootstrapOrders.map(normalizeOrder);
  state.outlets = sampleOutlets.map((outlet) => ({ ...outlet }));
  state.partners = samplePartners.map((partner) => ({ ...partner }));
  state.nextOrderId = getNextOrderId(state.orders);
}

async function saveState() {
  state.nextOrderId = getNextOrderId(state.orders);
  
  // Auto-save to Google Sheets
  if (typeof window.SheetsSync?.saveAll === 'function') {
    const success = await window.SheetsSync.saveAll();
    if (success) {
      console.log('Auto-saved all changes to Google Sheets');
    }
  }
  
  // Keep local backup
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      orders: state.orders,
      outlets: state.outlets,
      partners: state.partners,
      nextOrderId: state.nextOrderId
    })
  );
}

function saveAuth() {
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      loggedIn: state.loggedIn,
      role: state.role,
      outletName: state.outletName
    })
  );
}

function normalizeOrder(order) {
  const normalized = {
    id: String(order.id || ""),
    customer: order.customer || "Customer",
    mobile: order.mobile || "",
    outlet: order.outlet || "Outlet 42",
    item: order.item || "Custom Cake",
    quantity: order.quantity || "1 kg",
    amount: Number(order.amount || 0),
    paymentType: order.paymentType || order.payment || "Cash",
    paymentStatus: normalizePaymentStatus(order.paymentStatus || order.payment || "Pending"),
    status: normalizeStatus(order.status),
    deliveryType: order.deliveryType || "Delivery",
    priority: normalizePriority(order.priority),
    orderDate: order.orderDate || order.date || new Date().toISOString().slice(0, 10),
    orderTime: order.orderTime || "10:00 AM",
    deliveryDate: order.deliveryDate || order.date || new Date().toISOString().slice(0, 10),
    deliveryTime: order.deliveryTime || "06:00 PM",
    assignedPartnerId: order.assignedPartnerId || "",
    informedBy: order.informedBy || "",
    address: order.address || "",
    fullAddress: order.fullAddress || "",
    remark: order.remark || "",
    cash: Number(order.cash || 0),
    online: Number(order.online || 0),
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || new Date().toISOString(),
    deliveredAt: order.deliveredAt || "",
    reminderFlags: { "60": false, "30": false, ...(order.reminderFlags || {}) }
  };

  if (!normalized.amount && normalized.cash + normalized.online > 0) {
    normalized.amount = normalized.cash + normalized.online;
  }

  if (normalized.status === "Delivered" && !normalized.deliveredAt) {
    normalized.deliveredAt = normalized.updatedAt;
  }

  return normalized;
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  if (ORDER_STATUSES.includes(value)) return value;
  if (value === "New") return "Preparing";
  if (value === "ReadyForPickup") return "Ready";
  if (value === "Delivery") return "OutForDelivery";
  if (value === "Done") return "Delivered";
  return "Preparing";
}

function normalizePriority(priority) {
  const value = String(priority || "").trim();
  if (["Low", "Normal", "High", "Critical"].includes(value)) return value;
  return "Normal";
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim();
  if (value === "Paid" || value === "Pending" || value === "PartiallyPaid") return value;
  if (value === "Part Payment") return "PartiallyPaid";
  return "Pending";
}

function getOrderIdSerial(id) {
  const value = String(id || "").trim();
  if (!value) return 0;

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return Math.floor(Math.max(0, numeric));
  }

  const trailingDigitsMatch = value.match(/(\d+)$/);
  return trailingDigitsMatch ? Number(trailingDigitsMatch[1]) || 0 : 0;
}

function getNextOrderId(orders) {
  const highest = orders.reduce((max, order) => Math.max(max, getOrderIdSerial(order.id)), 0);
  return highest + 1;
}

function getVisibleOrders() {
  return state.role === "outlet"
    ? state.orders.filter((order) => order.outlet === state.outletName)
    : [...state.orders];
}

function canAccessView(viewId) {
  return state.role === "admin" || ALLOWED_OUTLET_VIEWS.has(viewId);
}

function canEditFullOrder() {
  return state.role === "admin";
}

function isOutletUser() {
  return state.role === "outlet";
}

function canUpdateOrderStatus(order) {
  if (state.role === "admin") return true;
  return state.role === "outlet" && order.outlet === state.outletName;
}

function updateOrderStatus(orderId, newStatus) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !canUpdateOrderStatus(order)) return;

  const safeStatus = normalizeStatus(newStatus);
  const previousStatus = order.status;
  order.status = safeStatus;
  order.updatedAt = new Date().toISOString();

  if (order.status === "Delivered" && previousStatus !== "Delivered") {
    order.deliveredAt = new Date().toISOString();
    state.dashboardTab = "delivered";
  }

  if (order.status !== "Delivered" && canEditFullOrder()) {
    order.deliveredAt = "";
  }

  saveState();
  showToast(`Order #${order.id} status updated to ${getStatusLabel(order.status)}.`);
}

function getPartnerName(partnerId) {
  const partner = state.partners.find((item) => item.id === partnerId);
  return partner ? partner.name : "Unassigned";
}

function getStatusLabel(status) {
  return {
    Preparing: "Preparing",
    Ready: "Ready",
    OutForDelivery: "Out for Delivery",
    Delivered: "Delivered",
    Delayed: "Delayed"
  }[status] || status;
}

function getPriorityLabel(priority) {
  return priority === "Critical" ? "Critical" : priority;
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatTime12(dateOrValue) {
  const date = typeof dateOrValue === "string" ? new Date(`1970-01-01T${dateOrValue}`) : dateOrValue;
  if (Number.isNaN(date.getTime())) return String(dateOrValue || "");
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function formatActualDeliveryTime(order) {
  if (!order.deliveredAt) {
    return order.status === "Delivered" ? "Delivered time unavailable" : "Not delivered yet";
  }

  const deliveredDate = new Date(order.deliveredAt);
  if (Number.isNaN(deliveredDate.getTime())) {
    return "Delivered time unavailable";
  }

  return `${deliveredDate.toLocaleDateString("en-IN")} ${deliveredDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function parseTimeString(value) {
  const trimmed = String(value || "").trim();
  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    const period = twelveHour[3].toUpperCase();
    if (hours === 12) hours = period === "AM" ? 0 : 12;
    else if (period === "PM") hours += 12;
    return { hours, minutes };
  }

  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
  }

  return null;
}

function getOrderDeliveryTimestamp(order) {
  const time = parseTimeString(order.deliveryTime);
  if (!order.deliveryDate || !time) return null;
  // Split date to avoid timezone shifts
  const [year, month, day] = order.deliveryDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}

function getTimeFromSelects(hourSelect, minuteSelect, ampmSelect) {
  const hour = hourSelect.value;
  const minute = minuteSelect.value;
  const ampm = ampmSelect.value;
  if (!hour || !minute || !ampm) return "";
  return `${hour}:${minute} ${ampm}`;
}

function setTimeSelects(timeString, hourSelect, minuteSelect, ampmSelect) {
  const trimmed = String(timeString || "").trim();
  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = twelveHour[2];
    const period = twelveHour[3].toUpperCase();
    hourSelect.value = String(hours).padStart(2, '0');
    minuteSelect.value = minutes;
    ampmSelect.value = period;
  } else {
    hourSelect.value = "";
    minuteSelect.value = "";
    ampmSelect.value = "AM";
  }
}

function getOrderDueState(order) {
  const deliveryTimestamp = getOrderDeliveryTimestamp(order);
  if (!deliveryTimestamp) {
    return { level: "unknown", message: "No delivery slot", isRisk: false, minutesRemaining: Infinity };
  }

  if (order.status === "Delivered") {
    return { level: "done", message: "Completed", isRisk: false, minutesRemaining: -Infinity };
  }

  const diffMs = deliveryTimestamp.getTime() - Date.now();
  const minutesRemaining = Math.round(diffMs / 60000);
  if (minutesRemaining < 0) {
    return { level: "overdue", message: `${Math.abs(minutesRemaining)} min overdue`, isRisk: true, minutesRemaining };
  }
  if (minutesRemaining <= 30) {
    return { level: "urgent", message: `${minutesRemaining} min left`, isRisk: true, minutesRemaining };
  }
  if (minutesRemaining <= 120) {
    return { level: "watch", message: `${minutesRemaining} min left`, isRisk: order.status === "Preparing", minutesRemaining };
  }
  return { level: "safe", message: `${Math.floor(minutesRemaining / 60)} hr left`, isRisk: false, minutesRemaining };
}

function isOrderLate(order) {
  return getOrderDueState(order).level === "overdue" || order.status === "Delayed";
}

function isOrderOpen(order) {
  return order.status !== "Delivered";
}

function compareOrders(a, b) {
  const aState = getOrderDueState(a);
  const bState = getOrderDueState(b);
  if (aState.minutesRemaining !== bState.minutesRemaining) {
    return aState.minutesRemaining - bState.minutesRemaining;
  }
  if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  }
  return Number(a.id) - Number(b.id);
}

function compareDeliverySchedule(a, b) {
  const aTime = getOrderDeliveryTimestamp(a)?.getTime() || Number.MAX_SAFE_INTEGER;
  const bTime = getOrderDeliveryTimestamp(b)?.getTime() || Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return compareOrders(a, b);
}

function compareDeliveredOrders(a, b) {
  const aActual = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
  const bActual = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
  if (aActual !== bActual) return bActual - aActual;
  return compareDeliverySchedule(a, b);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function matchesDashboardTab(order) {
  const today = getTodayDateString();
  const tomorrow = getTomorrowDateString();

  if (state.dashboardTab === "today") {
    return order.deliveryDate === today && order.status !== "Delivered";
  }
  if (state.dashboardTab === "tomorrow") {
    return order.deliveryDate === tomorrow && order.status !== "Delivered";
  }
  if (state.dashboardTab === "future") {
    return order.deliveryDate > tomorrow && order.status !== "Delivered";
  }
  if (state.dashboardTab === "delivered") {
    return order.status === "Delivered";
  }
  return true;
}

function getDashboardOrders() {
  const search = controls.dashboardSearch.value.trim().toLowerCase();
  const status = controls.dashboardStatus.value;
  const outlet = controls.dashboardOutlet.value;

  return getVisibleOrders()
    .filter((order) => {
      const matchesTab = matchesDashboardTab(order);
      const matchesSearch =
        !search ||
        [order.id, order.customer, order.mobile, order.item, order.outlet]
          .some((value) => String(value || "").toLowerCase().includes(search));
      const matchesStatus = state.dashboardTab === "delivered"
        ? order.status === "Delivered"
        : status === "all" || order.status === status;
      const matchesOutlet = outlet === "all" || order.outlet === outlet;
      return matchesTab && matchesSearch && matchesStatus && matchesOutlet;
    })
    .sort(state.dashboardTab === "delivered" ? compareDeliveredOrders : compareDeliverySchedule);
}

function deriveOutletMetrics(orders) {
  return state.outlets.map((outlet) => {
    const outletOrders = orders.filter((order) => order.outlet === outlet.name);
    return {
      name: outlet.name,
      active: outletOrders.filter(isOrderOpen).length,
      delivered: outletOrders.filter((order) => order.status === "Delivered").length,
      revenue: outletOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      pendingPayment: outletOrders
        .filter((order) => order.paymentStatus !== "Paid")
        .reduce((sum, order) => sum + Number(order.amount || 0), 0),
      late: outletOrders.filter(isOrderLate).length
    };
  });
}

function derivePartnerMetrics(orders) {
  return state.partners.map((partner) => {
    const assigned = orders.filter((order) => order.assignedPartnerId === partner.id);
    return {
      ...partner,
      active: assigned.filter((order) => order.status === "OutForDelivery").length,
      readyQueue: assigned.filter((order) => order.status === "Ready").length,
      late: assigned.filter(isOrderLate).length
    };
  });
}

function updateSelectOptions() {
  const visibleOrders = getVisibleOrders();
  const dashboardOutletValue = controls.dashboardOutlet.value;
  const deliveryOutletValue = controls.deliveryOutlet.value;
  const reportOutletValue = controls.reportOutlet.value;
  const orderOutletValue = controls.orderOutlet.value;
  const orderPartnerValue = controls.orderPartner.value;
  const detailPartnerValue = controls.orderDetailPartnerInput.value;
  const outletValues = state.role === "outlet"
    ? [state.outletName]
    : [...new Set(state.outlets.map((outlet) => outlet.name))];
  const outletOptions = ['<option value="all">All Outlets</option>', ...outletValues.map((value) => `<option value="${value}">${value}</option>`)];

  controls.dashboardOutlet.innerHTML = outletOptions.join("");
  controls.deliveryOutlet.innerHTML = outletOptions.join("");
  const reportOutletOptions = outletValues.map((value) => `<option value="${value}">${value}</option>`);
  controls.reportOutlet.innerHTML = reportOutletOptions.join("");

  if (state.role === "outlet") {
    controls.dashboardOutlet.value = state.outletName;
    controls.deliveryOutlet.value = state.outletName;
    controls.reportOutlet.value = state.outletName;
    controls.dashboardOutlet.disabled = true;
    controls.deliveryOutlet.disabled = true;
    controls.reportOutlet.disabled = true;
  } else {
    controls.dashboardOutlet.disabled = false;
    controls.deliveryOutlet.disabled = false;
    controls.reportOutlet.disabled = false;
    controls.dashboardOutlet.value = outletValues.includes(dashboardOutletValue) ? dashboardOutletValue : "all";
    controls.deliveryOutlet.value = outletValues.includes(deliveryOutletValue) ? deliveryOutletValue : "all";
    controls.reportOutlet.value = outletValues.includes(reportOutletValue) ? reportOutletValue : "all";
  }

  controls.orderOutlet.innerHTML = state.outlets
    .map((outlet) => `<option value="${outlet.name}">${outlet.name}</option>`)
    .join("");
  controls.orderOutlet.value = state.outlets.some((outlet) => outlet.name === orderOutletValue)
    ? orderOutletValue
    : state.outlets[0]?.name || "";

  const partnerOptions = ['<option value="">Unassigned</option>']
    .concat(state.partners.map((partner) => `<option value="${partner.id}">${partner.name}</option>`))
    .join("");
  controls.orderPartner.innerHTML = partnerOptions;
  controls.orderDetailPartnerInput.innerHTML = partnerOptions;
  controls.orderPartner.value = state.partners.some((partner) => partner.id === orderPartnerValue) ? orderPartnerValue : "";
  controls.orderDetailPartnerInput.value = state.partners.some((partner) => partner.id === detailPartnerValue) ? detailPartnerValue : "";

  const itemValues = [...new Set(visibleOrders.map((order) => order.item).concat([
    "Black Forest Cake", "Rainbow Cake", "Pineapple Cake", "Fresh Fruit Cake", "Chocolate Cake", "Vanilla Cake", "Red Velvet Cake", "Butterscotch Cake"
  ]))];
  const addressValues = [...new Set(visibleOrders.flatMap((order) => [order.address, order.fullAddress]).concat([
    "Rohini Sector 7", "Pitampura", "Karol Bagh", "Connaught Place", "Lajpat Nagar", "Dwarka", "Noida Sector 18", "Gurgaon"
  ]))];
  const informedValues = [...new Set(visibleOrders.map((order) => order.informedBy).concat([
    "WhatsApp", "Instagram", "Facebook", "Store Call", "Referral", "Website"
  ]))];
  const dateValues = [...new Set(visibleOrders.flatMap((order) => [order.orderDate, order.deliveryDate]).concat([
    new Date().toISOString().slice(0, 10),
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    new Date(Date.now() + 172800000).toISOString().slice(0, 10)
  ]))];
  const timeOptions = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM"];

  const quantityValues = [...new Set(visibleOrders.map((order) => order.quantity).concat([
    "1 kg", "1.5 kg", "2 kg", "0.5 kg", "2 pcs", "1 pc", "3 pcs", "500 g", "750 g"
  ]))];

  updateSuggestionList("item-suggestions", itemValues);
  updateSuggestionList("address-suggestions", addressValues);
  updateSuggestionList("informed-by-suggestions", informedValues);
  updateSuggestionList("date-suggestions", dateValues);
  updateSuggestionList("time-suggestions", timeOptions);
  updateSuggestionList("quantity-suggestions", quantityValues);
}

function updateSuggestionList(listId, values) {
  const list = $(listId);
  if (!list) return;
  const unique = [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
  list.innerHTML = unique.map((value) => `<option value="${value}">`).join("");
}

function renderApp() {
  updateSelectOptions();
  renderDashboard();
  renderDelivery();
  renderOutlets();
  renderPartners();
  renderReports();
  renderGoogleSheet();
  renderOutletReports();
}

function renderDashboard() {
  // If dashboard.js is loaded, use its more detailed view
  if (typeof renderDashboardView === 'function') {
    renderDashboardView();
  }

  const visibleOrders = getVisibleOrders();
  const orders = getDashboardOrders();
  controls.dashboardTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.dashboardTab);
  });
  const totals = {
    total: visibleOrders.length,
    preparing: visibleOrders.filter((order) => order.status === "Preparing").length,
    ready: visibleOrders.filter((order) => order.status === "Ready").length,
    outForDelivery: visibleOrders.filter((order) => order.status === "OutForDelivery").length,
    delivered: visibleOrders.filter((order) => order.status === "Delivered").length,
    risk: visibleOrders.filter((order) => getOrderDueState(order).isRisk).length
  };

  controls.statTotal.textContent = totals.total;
  controls.statPreparing.textContent = totals.preparing;
  controls.statReady.textContent = totals.ready;
  controls.statDelivery.textContent = totals.outForDelivery;
  controls.statDelivered.textContent = totals.delivered;
  controls.statRisk.textContent = totals.risk;
  controls.sidebarDelivered.textContent = totals.delivered;

  const riskOrders = visibleOrders.filter((order) => getOrderDueState(order).isRisk).sort(compareOrders);
  controls.riskCountBadge.textContent = `${riskOrders.length} alerts`;
  controls.riskList.innerHTML = riskOrders.length
    ? riskOrders.slice(0, 6).map(renderRiskItem).join("")
    : '<div class="empty-state">No urgent risks right now. The delivery queue looks healthy.</div>';

  const workflowBuckets = [
    { key: "Preparing", label: "Preparing" },
    { key: "Ready", label: "Ready" },
    { key: "OutForDelivery", label: "Out for Delivery" },
    { key: "Delayed", label: "Delayed" },
    { key: "Delivered", label: "Delivered" }
  ];
  controls.workflowBoard.innerHTML = workflowBuckets
    .map(({ key, label }) => {
      const allOrders = orders
        .filter((order) => order.status === key)
        .sort(key === "Delivered" ? compareDeliveredOrders : compareOrders);
      return `
        <div class="workflow-column">
          <div class="workflow-column-header">
            <strong>${label}</strong>
            <span>${allOrders.length}</span>
          </div>
          <div class="workflow-column-body">
            ${allOrders.length ? allOrders.slice(0, 4).map((order) => renderWorkflowOrder(order)).join("") : '<span class="empty-chip">No orders</span>'}
          </div>
        </div>
      `;
    })
    .join("");

  controls.dashboardOrderList.innerHTML = orders.length
    ? orders.map((order) => renderOrderCard(order)).join("")
    : `<div class="empty-state">No ${state.dashboardTab} orders match the current filters.</div>`;
}

function renderRiskItem(order) {
  const dueState = getOrderDueState(order);
  return `
    <button class="risk-item" type="button" data-order-id="${order.id}">
      <div>
        <strong>#${order.id} ${order.item}</strong>
        <p>${order.outlet} - ${order.customer}</p>
      </div>
      <div class="risk-item-meta">
        <span class="priority-pill ${order.priority}">${order.priority}</span>
        <span class="due-pill ${dueState.level}">${dueState.message}</span>
      </div>
    </button>
  `;
}

function renderWorkflowOrder(order) {
  return `
    <button class="workflow-order" type="button" data-order-id="${order.id}">
      <strong>#${order.id}</strong>
      <span>${order.customer}</span>
      <small>${order.deliveryTime}</small>
    </button>
  `;
}

function renderOrderCard(order) {
  const dueState = getOrderDueState(order);
  const expectedTime = `${order.deliveryDate} ${order.deliveryTime}`;
  const actualTime = formatActualDeliveryTime(order);
  return `
    <article class="order-card reveal-card">
      <div class="order-header">
        <div>
          <strong>#${order.id}</strong>
          <div class="order-subline">${order.customer}</div>
        </div>
        <select class="status-select status-pill ${order.status}" data-action="status" data-id="${order.id}">
          ${ORDER_STATUSES
            .map((status) => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${getStatusLabel(status)}</option>`)
            .join('')}
        </select>
      </div>
      <h2>${order.item}</h2>
      <p>${order.quantity} - ${formatCurrency(order.amount)}</p>
      <div class="order-meta"><span>${order.outlet}</span><span>${order.deliveryType}</span></div>
      <div class="order-meta"><span>Expected: ${expectedTime}</span><span>${getPartnerName(order.assignedPartnerId)}</span></div>
      <div class="order-meta"><span>Actual: ${actualTime}</span><span>${order.mobile}</span></div>
      <div class="card-badges">
        <span class="priority-pill ${order.priority}">${getPriorityLabel(order.priority)}</span>
        <span class="due-pill ${dueState.level}">${dueState.message}</span>
        <span class="surface-badge">${order.paymentStatus === "PartiallyPaid" ? "Partially Paid" : order.paymentStatus}</span>
      </div>
      <div class="order-actions">
        <button class="order-action" type="button" data-order-id="${order.id}">Open Order</button>
      </div>
    </article>
  `;
}

function renderDelivery() {
  const outlet = controls.deliveryOutlet.value;
  const status = controls.deliveryStatus.value;
  const visibleOrders = getVisibleOrders();
  const filtered = visibleOrders
    .filter((order) => {
      const matchesOutlet = outlet === "all" || order.outlet === outlet;
      const matchesStatus = status === "all" || order.status === status;
      return matchesOutlet && matchesStatus;
    })
    .sort(compareOrders);

  controls.deliverySummary.innerHTML = `
    <article class="stat-card gradient-2"><span>Ready Queue</span><strong>${visibleOrders.filter((order) => order.status === "Ready").length}</strong></article>
    <article class="stat-card gradient-4"><span>On Route</span><strong>${visibleOrders.filter((order) => order.status === "OutForDelivery").length}</strong></article>
    <article class="stat-card gradient-5"><span>Overdue</span><strong>${visibleOrders.filter(isOrderLate).length}</strong></article>
  `;

  controls.deliveryOrderList.innerHTML = filtered.length
    ? filtered.map((order) => renderOrderCard(order)).join("")
    : '<div class="empty-state">No delivery orders match the selected filters.</div>';
}

function renderOutlets() {
  const metrics = deriveOutletMetrics(getVisibleOrders());
  const rows = state.role === "outlet"
    ? metrics.filter((metric) => metric.name === state.outletName)
    : metrics;

  controls.outletSummary.innerHTML = rows
    .map(
      (outlet) => `
        <article class="outlet-card reveal-card">
          <h3>${outlet.name}</h3>
          <p>${outlet.active} active orders</p>
          <p>${outlet.delivered} delivered</p>
          <p>${formatCurrency(outlet.revenue)} revenue</p>
        </article>
      `
    )
    .join("");

  controls.outletTableBody.innerHTML = rows
    .map(
      (outlet) => `
        <tr>
          <td>${outlet.name}</td>
          <td>${outlet.active}</td>
          <td>${formatCurrency(outlet.revenue)}</td>
          <td>${formatCurrency(outlet.pendingPayment)}</td>
        </tr>
      `
    )
    .join("");
}

function renderPartners() {
  const metrics = derivePartnerMetrics(state.orders);
  controls.partnerList.innerHTML = metrics.length
    ? metrics
        .map(
          (partner) => `
            <article class="partner-card reveal-card">
              <div class="order-header">
                <h3>${partner.name}</h3>
                <span class="surface-badge">${partner.status}</span>
              </div>
              <p>${partner.phone} - ${partner.vehicle}</p>
              <div class="card-badges">
                <span class="surface-badge">On route ${partner.active}</span>
                <span class="surface-badge">Ready ${partner.readyQueue}</span>
                <span class="surface-badge">${partner.late} late</span>
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">No delivery partners found.</div>';
}

function renderReports() {
  const orderFromDate = controls.reportOrderFrom.value;
  const orderToDate = controls.reportOrderTo.value;
  const deliveryFromDate = controls.reportDeliveryFrom.value;
  const deliveryToDate = controls.reportDeliveryTo.value;
  const outlets = Array.from(controls.reportOutlet.selectedOptions).map(option => option.value);
  const status = controls.reportStatus.value;
  const paymentType = controls.reportPaymentType.value;
  const deliveryType = controls.reportDeliveryType.value;
  const delayOrders = controls.reportDelayOrders.checked;

  const filtered = getVisibleOrders()
    .filter((order) => {
      let matches = true;
      if (orderFromDate) matches = matches && order.orderDate >= orderFromDate;
      if (orderToDate) matches = matches && order.orderDate <= orderToDate;
      if (deliveryFromDate) matches = matches && order.deliveryDate >= deliveryFromDate;
      if (deliveryToDate) matches = matches && order.deliveryDate <= deliveryToDate;
      if (outlets.length > 0) matches = matches && outlets.includes(order.outlet);
      if (status && status !== "all") matches = matches && order.status === status;
      if (paymentType && paymentType !== "all") matches = matches && order.paymentType === paymentType;
      if (deliveryType && deliveryType !== "all") matches = matches && order.deliveryType === deliveryType;
      if (delayOrders) matches = matches && isOrderLate(order);
      return matches;
    })
    .sort(compareOrders);

  reportFilteredOrders = filtered;
  const totalRevenue = filtered.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const pendingPay = filtered
    .filter((order) => order.paymentStatus !== "Paid")
    .reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const lateOrders = filtered.filter(isOrderLate).length;
  const onTimePercent = filtered.length ? Math.round(((filtered.length - lateOrders) / filtered.length) * 100) : 0;

  controls.reportTotal.textContent = filtered.length;
  controls.reportRevenue.textContent = formatCurrency(totalRevenue);
  controls.reportPending.textContent = formatCurrency(pendingPay);
  controls.reportOnTime.textContent = `${onTimePercent}%`;
  controls.reportLate.textContent = lateOrders;

  controls.reportTableBody.innerHTML = filtered.length
    ? filtered
        .map(
          (order) => {
            const deliveryTimestamp = getOrderDeliveryTimestamp(order);
            const deliveredAt = order.status === "Delivered" ? (order.deliveredAt || order.updatedAt) : null;
            const actualTimestamp = deliveredAt ? new Date(deliveredAt) : null;
            
            let lateMinutes = 0;
            if (deliveryTimestamp) {
              const compareTime = actualTimestamp ? actualTimestamp.getTime() : Date.now();
              lateMinutes = Math.max(0, Math.round((compareTime - deliveryTimestamp.getTime()) / 60000));
            }

            const actualTime = order.status === "Delivered" ? (actualTimestamp ? formatTime12(actualTimestamp) : "Done") : "Pending";
            const cash = Number(order.cash || 0);
            const online = Number(order.online || 0);
            const total = Number(order.amount || 0);
            const dueBalance = Math.max(0, total - (cash + online));
            
            return `
              <tr>
                <td>#${order.id}</td>
                <td>${order.orderDate}</td>
                <td>${order.deliveryDate}</td>
                <td>${order.deliveryTime}</td>
                <td>${actualTime}</td>
                <td>${lateMinutes}</td>
                <td>${order.paymentStatus}</td>
                <td>${formatCurrency(cash)}</td>
                <td>${formatCurrency(online)}</td>
                <td>${formatCurrency(total)}</td>
                <td>${formatCurrency(dueBalance)}</td>
              </tr>
            `;
          }
        )
        .join("")
    : '<tr><td colspan="11">No report data for the selected filters.</td></tr>';

  renderCharts(filtered);
}

let outletPieChartInstance = null;
let statusPieChartInstance = null;
let paymentPieChartInstance = null;

function renderCharts(filtered) {
  // Destroy existing charts
  if (outletPieChartInstance) outletPieChartInstance.destroy();
  if (statusPieChartInstance) statusPieChartInstance.destroy();
  if (paymentPieChartInstance) paymentPieChartInstance.destroy();

  // Register the datalabels plugin if available
  if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  // Outlet-wise orders pie chart
  const outletCounts = {};
  filtered.forEach((order) => {
    outletCounts[order.outlet] = (outletCounts[order.outlet] || 0) + 1;
  });
  const outletLabels = Object.keys(outletCounts);
  const outletData = Object.values(outletCounts);
  outletPieChartInstance = new Chart(controls.outletPieChart, {
    type: 'pie',
    data: {
      labels: outletLabels,
      datasets: [{
        data: outletData,
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
      }]
    },
    options: {
      responsive: true,
      layout: {
        padding: 30
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
        datalabels: {
          anchor: 'end',
          align: 'end',
          offset: 10,
          color: '#444',
          font: { weight: 'bold', size: 11 },
          formatter: (value, ctx) => {
            const label = ctx.chart.data.labels[ctx.dataIndex];
            return `${label}: ${value}`;
          }
        }
      }
    }
  });

  // Order status pie chart: Delivered vs Remaining
  const delivered = filtered.filter(order => order.status === 'Delivered').length;
  const remaining = filtered.length - delivered;
  statusPieChartInstance = new Chart(controls.statusPieChart, {
    type: 'pie',
    data: {
      labels: ['Delivered', 'Remaining'],
      datasets: [{
        data: [delivered, remaining],
        backgroundColor: ['#4CAF50', '#FF9800'],
      }]
    },
    options: {
      responsive: true,
      layout: {
        padding: 30
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
        datalabels: {
          anchor: 'end',
          align: 'end',
          offset: 8,
          color: '#444',
          font: { weight: 'bold', size: 11 },
          formatter: (value, ctx) => {
            const label = ctx.chart.data.labels[ctx.dataIndex];
            return `${label}: ${value}`;
          }
        }
      }
    }
  });

  // Payment status pie chart: Paid vs Delayed
  const paid = filtered.filter(order => order.paymentStatus === 'Paid').length;
  const delayedPayments = filtered.length - paid;
  paymentPieChartInstance = new Chart(controls.paymentPieChart, {
    type: 'pie',
    data: {
      labels: ['Paid', 'Pending/Delayed'],
      datasets: [{
        data: [paid, delayedPayments],
        backgroundColor: ['#2196F3', '#F44336'],
      }]
    },
    options: {
      responsive: true,
      layout: {
        padding: 30
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
        datalabels: {
          anchor: 'end',
          align: 'end',
          offset: 8,
          color: '#444',
          font: { weight: 'bold', size: 11 },
          formatter: (value, ctx) => {
            const label = ctx.chart.data.labels[ctx.dataIndex];
            return `${label}: ${value}`;
          }
        }
      }
    }
  });

  controls.outletPieLegend.innerHTML = outletLabels.length
    ? outletLabels.map((label, index) => `
        <div class="chart-label-row">
          <span>${label}</span>
          <strong>${outletData[index]}</strong>
        </div>
      `).join("")
    : '<div class="chart-label-row empty">No outlet data available.</div>';

  controls.statusPieLegend.innerHTML = `
    <div class="chart-label-row">
      <span>Delivered</span>
      <strong>${delivered}</strong>
    </div>
    <div class="chart-label-row">
      <span>Remaining</span>
      <strong>${remaining}</strong>
    </div>
  `;

  controls.paymentPieLegend.innerHTML = `
    <div class="chart-label-row">
      <span>Paid</span>
      <strong>${paid}</strong>
    </div>
    <div class="chart-label-row">
      <span>Pending/Delayed</span>
      <strong>${delayedPayments}</strong>
    </div>
  `;
}

function renderGoogleSheet() {
  const status = typeof window.SheetsSync?.status === 'function' ? window.SheetsSync.status() : {};
  controls.sheetStatus.innerHTML = `
    <div class="surface-badge ${status.connected ? 'success' : ''}">✅ LIVE Sheets: ${state.orders.length} orders</div>
    <div class="surface-badge">${status.lastSync || 'Sync starting...'}</div>
    <div class="surface-badge">Auto-sync: ${status.pollInterval || 'N/A'}</div>
  `;
}

function renderOutletReports() {
  if (state.role !== "outlet") {
    controls.outletReportPanel.classList.add("hidden");
    return;
  }

  const outletOrders = getVisibleOrders();
  controls.outletReportPanel.classList.remove("hidden");
  controls.outletReportTotal.textContent = outletOrders.length;
  controls.outletReportRevenue.textContent = formatCurrency(outletOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0));
  controls.outletReportPending.textContent = outletOrders.filter(isOrderOpen).length;
}

/**
 * REBUILT DATA ENTRY LOGIC
 * Ensures clean validation, automatic ID generation, and multi-sync (Local + Sheets)
 */
async function handleOrderSubmit(event) {
  event.preventDefault();
  if (!state.loggedIn) return showToast("Please login first.");

  try {
    // 1. Collect Data
    const orderData = {
      customer: controls.orderCustomer.value.trim(),
      mobile: controls.orderMobile.value.trim(),
      item: controls.orderItem.value.trim(),
      amount: parseFloat(controls.orderAmount.value) || 0,
      outlet: state.role === "outlet" ? state.outletName : controls.orderOutlet.value,
      deliveryDate: controls.orderDeliveryDate.value,
      deliveryTime: getTimeFromSelects(controls.orderDeliveryTimeHour, controls.orderDeliveryTimeMinute, controls.orderDeliveryTimeAmpm)
    };

    // 2. Strict Validation
    if (!orderData.customer || !orderData.item || !orderData.deliveryDate) {
      return showToast("Fill mandatory fields: Customer, Item, and Delivery Date.");
    }
    if (orderData.mobile.length < 10) return showToast("Enter a valid 10-digit mobile number.");
    if (orderData.amount <= 0) return showToast("Amount must be greater than 0.");

    // 3. Payment Calculation
    let cash = 0, online = 0;
    const pType = controls.orderPaymentType.value;
    if (pType === "Cash") cash = orderData.amount;
    else if (pType === "UPI" || pType === "Card") online = orderData.amount;
    else if (pType === "Part Payment") {
      cash = parseFloat(controls.orderCash.value) || 0;
      online = parseFloat(controls.orderOnline.value) || 0;
      if (Math.abs((cash + online) - orderData.amount) > 1) {
        return showToast(`Total (${orderData.amount}) must match Cash+Online (${cash + online})`);
      }
    }

    // 4. Object Creation using normalizeOrder for consistency
    const newOrder = normalizeOrder({
      id: String(getNextOrderId(state.orders)),
      ...orderData,
      quantity: controls.orderQuantity.value.trim() || "1 kg",
      paymentType: pType,
      paymentStatus: controls.orderPaymentStatus.value,
      deliveryType: controls.orderDeliveryType.value,
      priority: controls.orderPriority.value,
      orderDate: controls.orderDate.value,
      orderTime: getTimeFromSelects(controls.orderTimeHour, controls.orderTimeMinute, controls.orderTimeAmpm),
      assignedPartnerId: controls.orderPartner.value,
      informedBy: controls.orderInformedBy.value.trim(),
      address: controls.orderAddress.value.trim(),
      fullAddress: controls.orderFullAddress.value.trim(),
      remark: controls.orderRemark.value.trim(),
      cash,
      online,
      status: "Preparing"
    });

    // 5. Save Sequence
    state.orders.unshift(newOrder);
    await saveState(); // This updates LocalStorage and Google Sheets

    // 6. UI Update
    showToast(`Order #${newOrder.id} successfully created!`);
    prepareOrderForm();
    renderApp();
    switchView("dashboard");

    // 7. Post-save Action
    setTimeout(() => {
      if (confirm("Would you like to send WhatsApp confirmation?")) {
        openWhatsappConfirmation(newOrder.id);
      }
    }, 500);

  } catch (err) {
    console.error("Order Creation Error:", err);
    showToast("Error saving order. Please try again.");
  }
}

function prepareOrderForm() {
  if (!controls.orderForm) return;
  controls.orderForm.reset();

  // Auto-set serial ID
  controls.orderNumber.value = String(getNextOrderId(state.orders));

  // Defaults for dates
  const today = new Date().toISOString().slice(0, 10);
  controls.orderDate.value = today;
  controls.orderDeliveryDate.value = today;

  // Defaults for times
  const now = new Date();
  const hh = String(now.getHours() % 12 || 12).padStart(2, '0');
  const mm = String(Math.ceil(now.getMinutes() / 5) * 5).padStart(2, '0');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';

  [controls.orderTimeHour, controls.orderDeliveryTimeHour].forEach(el => el.value = hh);
  [controls.orderTimeMinute, controls.orderDeliveryTimeMinute].forEach(el => el.value = mm === "60" ? "00" : mm);
  [controls.orderTimeAmpm, controls.orderDeliveryTimeAmpm].forEach(el => el.value = ampm);

  // Role-based outlet locking
  if (state.role === "outlet") {
    controls.orderOutlet.value = state.outletName;
    controls.orderOutlet.disabled = true;
  } else {
    controls.orderOutlet.disabled = false;
  }

  updatePaymentFields();
}

function updatePaymentFields() {
  controls.partPaymentFields.style.display = controls.orderPaymentType.value === "Part Payment" ? "grid" : "none";
}

function handleOrderListClick(event) {
  const target = event.target.closest("[data-action], [data-order-id]");
  if (!target) return;

  const action = target.dataset.action;
  const orderId = target.dataset.id || target.dataset.orderId;

  if (action === 'status') {
    return;
  }

  if (action === 'edit' || action === 'delete' || !action) {
    openOrderDetail(orderId);
  }
}

function handleStatusSelectChange(event) {
  const select = event.target;
  if (!select.matches('.status-select')) return;

  const orderId = select.dataset.id;
  const newStatus = select.value;
  updateOrderStatus(orderId, newStatus);

  renderApp();
}

function openOrderDetail(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;

  controls.orderDetailTitle.textContent = `Order #${order.id}`;
  controls.orderDetailCustomer.textContent = order.customer;
  controls.orderDetailMobile.textContent = order.mobile;
  controls.orderDetailOutlet.textContent = order.outlet;
  controls.orderDetailAmount.textContent = formatCurrency(order.amount);
  controls.orderDetailItem.textContent = order.item;
  controls.orderDetailQuantity.textContent = order.quantity;
  controls.orderDetailType.textContent = order.deliveryType;
  controls.orderDetailOrderDate.textContent = order.orderDate || "-";
  controls.orderDetailOrderTime.textContent = order.orderTime || "-";
  controls.orderDetailDate.textContent = order.deliveryDate;
  controls.orderDetailTime.textContent = order.deliveryTime;
  controls.orderDetailPriority.textContent = order.priority;
  controls.orderDetailPaymentStatus.textContent = order.paymentStatus === "PartiallyPaid" ? "Partially Paid" : order.paymentStatus;
  controls.orderDetailPartner.textContent = getPartnerName(order.assignedPartnerId);
  controls.orderDetailInfo.textContent = order.fullAddress || order.address || order.remark || "No extra notes";

  controls.orderDetailCustomerInput.value = order.customer;
  controls.orderDetailMobileInput.value = order.mobile;
  controls.orderDetailAmountInput.value = String(order.amount);
  controls.orderDetailItemInput.value = order.item;
  controls.orderDetailQuantityInput.value = order.quantity;
  controls.orderDetailDeliveryTypeInput.value = order.deliveryType;
  controls.orderDetailOrderDateInput.value = order.orderDate || "";
  setTimeSelects(order.orderTime, controls.orderDetailOrderTimeHour, controls.orderDetailOrderTimeMinute, controls.orderDetailOrderTimeAmpm);
  controls.orderDetailDateInput.value = order.deliveryDate;
  setTimeSelects(order.deliveryTime, controls.orderDetailTimeHour, controls.orderDetailTimeMinute, controls.orderDetailTimeAmpm);
  controls.orderDetailPriorityInput.value = order.priority;
  controls.orderDetailPaymentStatusInput.value = order.paymentStatus;
  controls.orderDetailPartnerInput.value = order.assignedPartnerId;
  controls.orderDetailInfoInput.value = order.fullAddress || order.address || order.remark || "";
  controls.orderDetailStatus.value = order.status;
  controls.orderDetailStatusLabel.textContent = getStatusLabel(order.status);
  controls.orderDetailSave.dataset.orderId = order.id;

  if (state.role === "admin") {
    controls.orderDetailStatusSelectContainer.classList.remove("hidden");
    controls.orderDetailStatusLabelContainer.classList.add("hidden");
    controls.orderDetailEdit.classList.remove("hidden");
    controls.orderDetailDelete.classList.remove("hidden");
    setOrderDetailEditMode(false);
  } else {
    controls.orderDetailStatusSelectContainer.classList.remove("hidden");
    controls.orderDetailStatusLabelContainer.classList.add("hidden");
    controls.orderDetailEdit.classList.add("hidden");
    controls.orderDetailDelete.classList.add("hidden");
    setOrderDetailEditMode(false);
    controls.orderDetailStatus.disabled = !canUpdateOrderStatus(order);
    controls.orderDetailSave.disabled = !canUpdateOrderStatus(order);
  }

  controls.orderDetailModal.classList.remove("hidden");
}

function setOrderDetailEditMode(editing) {
  state.detailEditing = editing;
  const fields = [
    [controls.orderDetailCustomer, controls.orderDetailCustomerInput],
    [controls.orderDetailMobile, controls.orderDetailMobileInput],
    [controls.orderDetailAmount, controls.orderDetailAmountInput],
    [controls.orderDetailItem, controls.orderDetailItemInput],
    [controls.orderDetailQuantity, controls.orderDetailQuantityInput],
    [controls.orderDetailType, controls.orderDetailDeliveryTypeInput],
    [controls.orderDetailOrderDate, controls.orderDetailOrderDateInput],
    [controls.orderDetailOrderTime, controls.orderDetailOrderTimeInput],
    [controls.orderDetailDate, controls.orderDetailDateInput],
    [controls.orderDetailTime, controls.orderDetailTimeInput],
    [controls.orderDetailPriority, controls.orderDetailPriorityInput],
    [controls.orderDetailPaymentStatus, controls.orderDetailPaymentStatusInput],
    [controls.orderDetailPartner, controls.orderDetailPartnerInput],
    [controls.orderDetailInfo, controls.orderDetailInfoInput]
  ];

  fields.forEach(([display, input]) => {
    display.classList.toggle("hidden", editing);
    input.classList.toggle("hidden", !editing);
  });

  if (state.role === "admin") {
    controls.orderDetailStatus.disabled = !editing;
    controls.orderDetailSave.disabled = !editing;
    controls.orderDetailEdit.textContent = editing ? "Cancel" : "Edit";
  }
}

function toggleOrderDetailEdit() {
  if (!canEditFullOrder()) return;
  if (state.detailEditing) {
    setOrderDetailEditMode(false);
    showToast("Edit cancelled.");
  } else {
    setOrderDetailEditMode(true);
    showToast("Edit mode enabled.");
  }
}

function saveOrderDetail() {
  const orderId = controls.orderDetailSave.dataset.orderId;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;

  if (canEditFullOrder() && state.detailEditing) {
    order.customer = controls.orderDetailCustomerInput.value.trim();
    order.mobile = controls.orderDetailMobileInput.value.trim();
    order.amount = Number(controls.orderDetailAmountInput.value || 0);
    order.item = controls.orderDetailItemInput.value.trim();
    order.quantity = controls.orderDetailQuantityInput.value.trim();
    order.deliveryType = controls.orderDetailDeliveryTypeInput.value;
    order.orderDate = controls.orderDetailOrderDateInput.value;
    order.orderTime = getTimeFromSelects(controls.orderDetailOrderTimeHour, controls.orderDetailOrderTimeMinute, controls.orderDetailOrderTimeAmpm);
    order.deliveryDate = controls.orderDetailDateInput.value;
    order.deliveryTime = getTimeFromSelects(controls.orderDetailTimeHour, controls.orderDetailTimeMinute, controls.orderDetailTimeAmpm);
    order.priority = controls.orderDetailPriorityInput.value;
    order.paymentStatus = controls.orderDetailPaymentStatusInput.value;
    order.assignedPartnerId = controls.orderDetailPartnerInput.value;
    order.fullAddress = controls.orderDetailInfoInput.value.trim();
  }

  if (!canUpdateOrderStatus(order)) {
    showToast("You do not have permission to update this order.");
    return;
  }

  const previousStatus = order.status;
  order.status = controls.orderDetailStatus.value;
  order.updatedAt = new Date().toISOString();

  if (order.status === "Delivered" && previousStatus !== "Delivered") {
    order.deliveredAt = new Date().toISOString();
  }

  if (order.status !== "Delivered" && canEditFullOrder()) {
    order.deliveredAt = "";
  }

  if (order.status === "Delivered" && previousStatus !== "Delivered") {
    state.dashboardTab = "delivered";
    controls.dashboardStatus.value = "Delivered";
  }

  saveState();
  closeOrderDetail();
  renderApp();
  showToast(`Order #${order.id} updated.`);
  openWhatsappConfirmation(order.id);
}

function handleOrderDelete() {
  if (!canEditFullOrder()) {
    showToast("Only admin can delete orders.");
    return;
  }

  const orderId = controls.orderDetailSave.dataset.orderId;
  const orderIndex = state.orders.findIndex((item) => item.id === orderId);
  if (orderIndex === -1) return;
  if (!window.confirm("Delete this order permanently?")) return;

  state.orders.splice(orderIndex, 1);
  saveState();
  closeOrderDetail();
  renderApp();
  showToast("Order deleted.");
}

function closeOrderDetail() {
  controls.orderDetailModal.classList.add("hidden");
  state.detailEditing = false;
}

function exportCurrentOrders() {
  const orders = getDashboardOrders();
  if (!orders.length) {
    showToast("No orders to export.");
    return;
  }

  const headers = ["Order ID", "Customer", "Outlet", "Item", "Amount", "Status", "Delivery Date", "Delivery Time", "Priority", "Partner"];
  const rows = orders.map((order) => [
    order.id,
    order.customer,
    order.outlet,
    order.item,
    order.amount,
    getStatusLabel(order.status),
    order.deliveryDate,
    order.deliveryTime,
    order.priority,
    getPartnerName(order.assignedPartnerId)
  ]);
  downloadCsv(headers, rows, `orders_${new Date().toISOString().slice(0, 10)}.csv`);
}

function getReportExportRows() {
  return reportFilteredOrders.map((order) => {
    const deliveryTimestamp = getOrderDeliveryTimestamp(order);
    const deliveredAt = order.status === "Delivered" ? (order.deliveredAt || order.updatedAt) : null;
    const actualTimestamp = deliveredAt ? new Date(deliveredAt) : null;
    
    let lateMinutes = 0;
    if (deliveryTimestamp) {
      const compareTime = actualTimestamp ? actualTimestamp.getTime() : Date.now();
      lateMinutes = Math.max(0, Math.round((compareTime - deliveryTimestamp.getTime()) / 60000));
    }

    const actualTime = order.status === "Delivered" ? (actualTimestamp ? formatTime12(actualTimestamp) : "Done") : "Pending";
    const cash = Number(order.cash || 0);
    const online = Number(order.online || 0);
    const total = Number(order.amount || 0);
    const dueBalance = Math.max(0, total - (cash + online));

    return [
      order.id,
      order.outlet,
      order.orderDate,
      order.deliveryDate,
      order.deliveryTime || "",
      actualTime,
      lateMinutes,
      getStatusLabel(order.paymentStatus),
      cash,
      online,
      total,
      dueBalance > 0 ? dueBalance : 0
    ];
  });
}

function exportReportsCsv() {
  const rows = getReportExportRows();
  if (!rows.length) {
    showToast("No reports to export.");
    return;
  }
  const headers = ["Order ID", "Outlet", "Order Date", "Delivery Date", "Expected Time", "Actual Time", "Late (min)", "Payment Status", "Cash", "Online", "Total", "Due Balance"];
  downloadCsv(headers, rows, `reports_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportReportsPdf() {
  const rows = getReportExportRows();
  if (!rows.length) {
    showToast("No reports to export.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  const headers = ["Order ID", "Outlet", "Order Date", "Delivery Date", "Expected Time", "Actual Time", "Late (min)", "Payment Status", "Cash", "Online", "Total", "Due Balance"];
  doc.setFontSize(14);
  doc.text("Order Reports", 14, 14);
  doc.setFontSize(10);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 22,
      theme: 'striped',
      headStyles: { fillColor: [84, 61, 211], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 12, right: 12 }
    });
  } else {
    let y = 22;
    doc.setFontSize(9);
    doc.text(headers.join(' | '), 14, y);
    y += 8;
    rows.forEach((row) => {
      doc.text(row.join(' | '), 14, y);
      y += 8;
      if (y > 180) {
        doc.addPage();
        y = 20;
      }
    });
  }

  doc.save(`reports_${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast("PDF export ready.");
}

function exportReportsExcel() {
  const rows = getReportExportRows();
  if (!rows.length) {
    showToast("No reports to export.");
    return;
  }
  const headers = ["Order ID", "Outlet", "Order Date", "Delivery Date", "Expected Time", "Actual Time", "Late (min)", "Payment Status", "Cash", "Online", "Total", "Due Balance"];
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reports");
  XLSX.writeFile(wb, `reports_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast("Excel export ready.");
}

function downloadCsv(headers, rows, filename) {
  const content = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Export ready.");
}

function saveSheetUrl() {
  if (!canEditFullOrder()) {
    showToast("Only admin can change sheet settings.");
    return;
  }
  localStorage.setItem(SHEET_URL_KEY, controls.sheetUrl.value.trim());
  renderGoogleSheet();
  showToast("Sheet URL saved.");
}

async function syncSheetSnapshot() {
  if (!canEditFullOrder()) {
    showToast("Only admin can run sync.");
    return;
  }
  const url = (localStorage.getItem(SHEET_URL_KEY) || "").trim();
  if (!url) {
    showToast("Save the deployed Google Apps Script URL first.");
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "syncOrders",
        orders: state.orders
      })
    });

    if (!response.ok) {
      throw new Error(`Sync failed with status ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Unknown sync error");
    }

    localStorage.setItem(SHEET_SYNC_KEY, new Date().toISOString());
    renderGoogleSheet();
    showToast(`Google Sheet synced. ${result.saved || state.orders.length} orders sent.`);
  } catch (error) {
    showToast(`Sheet sync failed: ${error.message}`);
  }
}

function copySheetScript() {
  const script = controls.sheetScriptCode.value;
  navigator.clipboard.writeText(script)
    .then(() => showToast("Apps Script code copied."))
    .catch(() => showToast("Copy failed. Please copy manually."));
}

function buildWhatsappMessage(order) {
  return [
    "Thank you so much for your recent order from Broomies! Your order number is (" + order.id + ").",
    "",
    "We're thrilled to have the opportunity to serve you and hope you enjoy every delicious bite.",
    "",
    "Order Details:",
    `Item: ${order.item} (${order.quantity})`,
    `Delivery Date: ${order.deliveryDate}`,
    `Delivery Time: ${formatWhatsappTime(order.deliveryTime)}`,
    "",
    "If you have any queries or need further assistance, please feel free to get in touch with us at:",
    SUPPORT_PHONE_PRIMARY,
    "",
    "If still query not solved call " + SUPPORT_PHONE_SECONDARY,
    "",
    "Best wishes,",
    "The Broomies Team"
  ].join("\n");
}

function formatWhatsappTime(timeValue) {
  const parsed = parseTimeString(timeValue);
  if (!parsed) return timeValue || "";
  return `${String(parsed.hours).padStart(2, "0")}:${String(parsed.minutes).padStart(2, "0")}`;
}

function sanitizePhoneNumber(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function openWhatsappConfirmation(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  state.pendingWhatsappOrderId = orderId;
  controls.whatsappCustomerName.textContent = order.customer;
  controls.whatsappCustomerNumber.textContent = sanitizePhoneNumber(order.mobile) || "No mobile number";
  controls.whatsappMessagePreview.value = buildWhatsappMessage(order);
  controls.whatsappModal.classList.remove("hidden");
}

function closeWhatsappConfirmation() {
  controls.whatsappModal.classList.add("hidden");
  state.pendingWhatsappOrderId = null;
}

function launchWhatsappConfirmation() {
  const order = state.orders.find((item) => item.id === state.pendingWhatsappOrderId);
  if (!order) {
    closeWhatsappConfirmation();
    return;
  }

  const phone = sanitizePhoneNumber(order.mobile);
  if (!phone) {
    showToast("Customer mobile number is missing.");
    return;
  }

  const message = encodeURIComponent(buildWhatsappMessage(order));
  window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  closeWhatsappConfirmation();
}

function showToast(message) {
  controls.toast.textContent = message;
  controls.toast.classList.add("visible");
  clearTimeout(window.toastTimer);
  window.toastTimer = window.setTimeout(() => controls.toast.classList.remove("visible"), 2400);
}

function openAdminPassword() {
  state.pendingOutlet = null;
  controls.passwordTitle.textContent = "Admin password required";
  controls.passwordInput.value = "";
  controls.passwordModal.classList.remove("hidden");
  controls.passwordInput.focus();
}

function openOutletPassword(outletName) {
  state.pendingOutlet = outletName;
  controls.passwordTitle.textContent = `Password for ${outletName}`;
  controls.passwordInput.value = "";
  controls.passwordModal.classList.remove("hidden");
  controls.passwordInput.focus();
}

function closePasswordModal() {
  controls.passwordModal.classList.add("hidden");
  controls.passwordInput.value = "";
}

function handlePasswordSubmit() {
  const password = controls.passwordInput.value.trim();
  if (!password) {
    showToast("Enter password.");
    return;
  }

  if (state.pendingOutlet) {
    if (password !== OUTLET_PASSWORDS[state.pendingOutlet]) {
      showToast("Incorrect outlet password.");
      return;
    }
    state.loggedIn = true;
    state.role = "outlet";
    state.outletName = state.pendingOutlet;
  } else {
    if (password !== ADMIN_PASSWORD) {
      showToast("Incorrect password.");
      return;
    }
    state.loggedIn = true;
    state.role = "admin";
    state.outletName = null;
  }

  state.pendingOutlet = null;
  saveAuth();
  closePasswordModal();
  setTimeout(showAppShell, 100); // Small delay to ensure state is set
  showToast(state.role === "admin" ? "Admin login successful." : `${state.outletName} login successful.`);
}

function showLoginPanel() {
  controls.loginPanel.classList.remove("hidden");
  controls.outletSelection.classList.add("hidden");
}

function showOutletSelection() {
  controls.loginPanel.classList.add("hidden");
  controls.outletSelection.classList.remove("hidden");
}

function showLoginScreen() {
  controls.loginScreen.classList.remove("hidden");
  controls.appShell.classList.add("hidden");
  controls.loginPanel.classList.remove("hidden");
  controls.outletSelection.classList.add("hidden");
  controls.filterPanel.classList.add("hidden");
  closeWhatsappConfirmation();
  document.body.classList.remove("viewer-mode");
}

function showAppShell() {
  controls.loginScreen.classList.add("hidden");
  controls.appShell.classList.remove("hidden");
  document.body.classList.toggle("viewer-mode", state.role === "outlet");

  controls.userName.textContent = state.role === "admin" ? "Admin" : state.outletName;
  controls.userStatus.textContent = state.role === "admin" ? "Full access" : "View and status access";
  controls.adminOnly.forEach((element) => {
    element.classList.toggle("hidden", state.role !== "admin");
  });

  if (!canAccessView(state.currentView)) {
    state.currentView = "dashboard";
  }

  prepareOrderForm();
  renderApp();
  switchView(state.currentView);
}

function logout() {
  state.loggedIn = false;
  state.role = null;
  state.outletName = null;
  state.pendingOutlet = null;
  localStorage.removeItem(AUTH_KEY);
  showLoginScreen();
  showToast("Logged out.");
}

function switchView(viewId) {
  if (!canAccessView(viewId)) {
    showToast("This page is admin only.");
    viewId = "dashboard";
  }

  state.currentView = viewId;
  controls.views.forEach((view) => view.classList.toggle("active", view.id === `view-${viewId}`));
  controls.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  controls.pageTitle.textContent = getViewLabel(viewId);
  controls.pageSubtitle.textContent = getViewSubtitle(viewId);

  if (viewId !== "dashboard") {
    state.filterOpen = false;
    controls.filterPanel.classList.add("hidden");
  }

  if (viewId === "dashboard") renderDashboard();
  if (viewId === "delivery") renderDelivery();
  if (viewId === "outlets") renderOutlets();
  if (viewId === "partners") renderPartners();
  if (viewId === "reports") renderReports();
  if (viewId === "google-sheet") renderGoogleSheet();
  if (viewId === "add-order") prepareOrderForm();
}

function getViewLabel(viewId) {
  return {
    dashboard: "Dashboard",
    "add-order": "Add Order",
    delivery: "Delivery",
    outlets: "Outlets",
    partners: "Partners",
    reports: "Reports",
    "google-sheet": "Google Sheet"
  }[viewId] || "Dashboard";
}

function getViewSubtitle(viewId) {
  return {
    dashboard: "Monitor the full order pipeline and catch delays before they happen.",
    "add-order": "Create complete orders with payment, partner, and delivery planning.",
    delivery: "Track ready, on-route, and overdue orders in one connected queue.",
    outlets: "Compare outlet workload, revenue, and pending payment in real time.",
    partners: "Review partner load so dispatch stays balanced.",
    reports: "Measure revenue, pending payment, and on-time performance.",
    "google-sheet": "Manage external sync settings and export a clean live snapshot."
  }[viewId] || "";
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-open");
  controls.sidebarBackdrop.classList.toggle("visible", document.body.classList.contains("sidebar-open"));
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  controls.sidebarBackdrop.classList.remove("visible");
}

function startDeliveryReminderChecker() {
  if (reminderTimer) clearInterval(reminderTimer);
  checkDeliveryReminders();
  reminderTimer = setInterval(checkDeliveryReminders, REMINDER_CHECK_INTERVAL_MS);
}

function checkDeliveryReminders() {
  if (!state.loggedIn || !state.role) return;

  const now = new Date();
  const allowedOutlet = state.role === "outlet" ? state.outletName : null;

  state.orders.forEach((order) => {
    if (order.status === "Delivered") return;
    if (allowedOutlet && order.outlet !== allowedOutlet) return;

    const deliveryTimestamp = getOrderDeliveryTimestamp(order);
    if (!deliveryTimestamp) return;
    const diffMs = deliveryTimestamp - now;
    if (diffMs < 0) return;

    REMINDER_MINUTES.forEach((minute) => {
      const key = String(minute);
      const targetMs = minute * 60 * 1000;
      if (diffMs <= targetMs && !order.reminderFlags[key]) {
        order.reminderFlags[key] = true;
        saveState();
        showDeliveryNotification(order, minute);
      }
    });
  });
}

function showDeliveryNotification(order, minute) {
  const label = minute === 60 ? "1 hour" : "30 minutes";
  reminderQueue.push({ order, minute, label });
  openNextReminderFromQueue();
}

function openNextReminderFromQueue() {
  if (!controls.notificationModal.classList.contains("hidden")) return;
  const nextReminder = reminderQueue.shift();
  if (!nextReminder) return;

  const { order, label } = nextReminder;
  controls.notificationMessage.textContent = `Order #${order.id} (${order.outlet}) delivery time ${order.deliveryTime}. Reminder: ${label} before delivery.`;
  controls.notificationModal.classList.remove("hidden");
  playNotificationSound();
}

function closeDeliveryNotification() {
  controls.notificationModal.classList.add("hidden");
  stopNotificationSound();
  openNextReminderFromQueue();
}

function playNotificationSound() {
  if (notificationAudioContext) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    notificationAudioContext = new AudioContextClass();
    notificationOscillator = notificationAudioContext.createOscillator();
    notificationGain = notificationAudioContext.createGain();
    notificationOscillator.type = "triangle";
    notificationOscillator.frequency.value = 880;
    notificationGain.gain.value = 0.0001;
    notificationOscillator.connect(notificationGain);
    notificationGain.connect(notificationAudioContext.destination);
    notificationOscillator.start();

    let pulseHigh = true;
    notificationToneInterval = window.setInterval(() => {
      if (!notificationAudioContext || !notificationGain || !notificationOscillator) return;
      const now = notificationAudioContext.currentTime;
      const targetFrequency = pulseHigh ? 980 : 740;
      notificationOscillator.frequency.cancelScheduledValues(now);
      notificationOscillator.frequency.linearRampToValueAtTime(targetFrequency, now + 0.05);

      notificationGain.gain.cancelScheduledValues(now);
      notificationGain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      notificationGain.gain.linearRampToValueAtTime(0.02, now + 0.18);
      pulseHigh = !pulseHigh;
    }, 320);
  } catch (error) {
    console.warn("Notification sound unavailable", error);
  }
}

function stopNotificationSound() {
  if (notificationToneInterval) {
    clearInterval(notificationToneInterval);
    notificationToneInterval = null;
  }

  if (!notificationAudioContext) return;
  try {
    if (notificationOscillator) notificationOscillator.stop();
    notificationAudioContext.close();
  } catch (error) {
    console.warn("Unable to stop notification sound", error);
  }
  notificationAudioContext = null;
  notificationOscillator = null;
  notificationGain = null;
}

async function init() {
  initControls();
  initListeners();
  
  // Start Sheets auto-sync
  if (typeof window.SheetsSync?.start === 'function') {
    window.SheetsSync.start();
  }
  
  await loadState();
  prepareOrderForm();
  renderApp();
  startDeliveryReminderChecker();

  if (state.loggedIn) showAppShell();
  else showLoginScreen();
}

window.addEventListener('beforeunload', () => {
  if (typeof window.SheetsSync?.stop === 'function') {
    window.SheetsSync.stop();
  }
});

window.addEventListener("DOMContentLoaded", init);
