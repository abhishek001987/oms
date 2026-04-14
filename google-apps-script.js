function doGet(e) {
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
}
