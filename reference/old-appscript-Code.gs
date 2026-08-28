/*  Frido Ergo Assessment — Backend relay (FINAL)
 *  ──────────────────────────────────────────────
 *  - Upserts each assessment as one row (keyed on Assessment ID)
 *  - Uploads customer photos to Drive, puts links in the sheet
 *  - Converts report HTML to PDF in Drive, puts link in the sheet
 *  - 62-column schema ready for admin dashboard
 *
 *  DEPLOY after every code change:
 *    Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy
 */

var CFG = {
  SHEET_ID:     "1wd1dO4vnmGUoP1iYciNKXCwQ6R5CoJCjT2YGrTTHEUo",
  TAB:          "Assessments",
  PHOTO_FOLDER: "1P3YldSpe8Ib_URDJK0SqfDaUC20R2Qcr",
  SHARED_TOKEN: ""
};

// 62 columns — matches portal flatRow() + server-side photo links + Report PDF + Last updated
var HEADERS = [
  "Assessment ID","Stage","Date","Session type","Store / City","Physiotherapist",
  "Customer","Age","Gender","Phone","Email","Occupation","Company","Work mode","Device",
  "Work h/day","Sitting h/day","Screen h/day","Height cm","Weight kg",
  "Conditions","Other conditions","Consent","Photo consent",
  "Reasons","Top pain","All pain","Red flags",
  "Breaks","Sitting bout","Activity","Owns","Setup",
  "Chair ROSA","Section B","Section C","FINAL ROSA","Band","Workspace Q",
  "On-spot","Work changes","Habit changes",
  "Products","Outcome","Order/Invoice","Purchase",
  "Follow-up type","Follow-up date","Voucher",
  "Fee status","Fee amount","Voucher code","Referrals",
  "Photo side","Photo above","Photo back","Photo seated","Photo count",
  "Report PDF",
  "Filled by","Submitted at","Last updated"
];

/* ═══════════════════════════════════════
   doGet — health check
   ═══════════════════════════════════════ */
function doGet() {
  try {
    var sh = getSheet();
    return jsonOut({ ok:true, msg:"Frido Ergo relay is live", tab:CFG.TAB, rows:Math.max(sh.getLastRow()-1,0) });
  } catch (err) {
    return jsonOut({ ok:false, error:String(err) });
  }
}

/* ═══════════════════════════════════════
   doPost — main relay
   ═══════════════════════════════════════ */
function doPost(e) {
  try {
    // Portal sends as FormData (survives Apps Script 302 redirect);
    // fall back to raw JSON body for backwards compatibility.
    var raw = e.postData.contents || "";
    var jsonStr = raw;
    if (e.parameter && e.parameter.payload) {
      jsonStr = e.parameter.payload;
    } else {
      // FormData comes through as multipart; extract the payload field
      var m = raw.match(/name="payload"\r?\n\r?\n([\s\S]*?)(?:\r?\n------|-$)/);
      if (m) jsonStr = m[1].trim();
    }
    var data = JSON.parse(jsonStr);

    if (CFG.SHARED_TOKEN && data.token !== CFG.SHARED_TOKEN) {
      return jsonOut({ ok:false, error:"bad token" });
    }

    var row    = data.row     || {};
    var photos = data.photos  || {};
    var html   = data.reportHTML || "";

    // 1. Upload photos to Drive → get shareable links
    var links = savePhotos(row["Assessment ID"], photos);
    if (links.side)   row["Photo side"]   = links.side;
    if (links.above)  row["Photo above"]  = links.above;
    if (links.back)   row["Photo back"]   = links.back;
    if (links.seated) row["Photo seated"] = links.seated;

    // 2. Convert report HTML → PDF in Drive
    var pdfLink = saveReportPdf(row["Assessment ID"], html);
    if (pdfLink) row["Report PDF"] = pdfLink;

    // 3. Server timestamp
    row["Last updated"] = new Date();

    // 4. Upsert
    upsertRow(row);

    return jsonOut({ ok:true, id:row["Assessment ID"] });

  } catch (err) {
    return jsonOut({ ok:false, error:String(err) });
  }
}

/* ═══════════════════════════════════════
   upsertRow
   ═══════════════════════════════════════ */
function upsertRow(row) {
  var sh = getSheet();
  var lastRow = sh.getLastRow();
  var numCols = HEADERS.length;

  // Build values array from HEADERS order
  var values = [];
  for (var c = 0; c < numCols; c++) {
    values.push(row[HEADERS[c]] !== undefined ? row[HEADERS[c]] : "");
  }

  // Find existing row by Assessment ID (column A)
  var existingIdx = -1;
  if (lastRow > 1) {
    var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < ids.length; r++) {
      if (ids[r][0] === row["Assessment ID"]) { existingIdx = r; break; }
    }
  }

  if (existingIdx >= 0) {
    var rowNum = existingIdx + 2;
    var existing = sh.getRange(rowNum, 1, 1, numCols).getValues()[0];
    // Preserve photo/PDF links if this sync doesn't include new ones
    var preserve = ["Photo side","Photo above","Photo back","Photo seated","Report PDF"];
    for (var p = 0; p < preserve.length; p++) {
      var ci = HEADERS.indexOf(preserve[p]);
      if (ci >= 0 && !values[ci] && existing[ci]) {
        values[ci] = existing[ci];
      }
    }
    sh.getRange(rowNum, 1, 1, numCols).setValues([values]);
  } else {
    sh.appendRow(values);
  }
}

/* ═══════════════════════════════════════
   savePhotos
   ═══════════════════════════════════════ */
function savePhotos(id, photos) {
  var out = {};
  if (!photos || !CFG.PHOTO_FOLDER) return out;
  var folder;
  try { folder = DriveApp.getFolderById(CFG.PHOTO_FOLDER); } catch(e) { return out; }

  var angles = Object.keys(photos);
  for (var i = 0; i < angles.length; i++) {
    var angle = angles[i];
    var uri = photos[angle];
    if (!uri || uri.indexOf("data:") !== 0) continue;
    try {
      var m = uri.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) continue;
      var fname = (id || "assessment") + "_" + angle + ".jpg";
      // Remove old version so we don't pile up duplicates
      var dupes = folder.getFilesByName(fname);
      while (dupes.hasNext()) { dupes.next().setTrashed(true); }
      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fname);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      out[angle] = file.getUrl();
    } catch (e) { /* skip bad photo, keep the rest */ }
  }
  return out;
}

/* ═══════════════════════════════════════
   saveReportPdf
   ═══════════════════════════════════════ */
function saveReportPdf(id, reportHTML) {
  if (!reportHTML || !CFG.PHOTO_FOLDER) return "";
  try {
    var folder = DriveApp.getFolderById(CFG.PHOTO_FOLDER);
    var fullHtml =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#2A3540;font-size:12px;line-height:1.5;margin:24px}' +
      'h1,h2,h3{color:#1F3A5F}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0}' +
      'td,th{border:1px solid #E4EAF0;padding:6px 8px;text-align:left;vertical-align:top;font-size:11px}' +
      '.pgrid{display:flex;flex-wrap:wrap;gap:10px}' +
      '.pgrid figure{flex:1 1 44%;margin:0}' +
      '.pgrid img{width:100%;border:1px solid #E4EAF0;border-radius:6px}' +
      '</style></head><body>' + reportHTML + '</body></html>';

    var fname = (id || "assessment") + "_report.pdf";
    var old = folder.getFilesByName(fname);
    while (old.hasNext()) { old.next().setTrashed(true); }

    var pdf = Utilities.newBlob(fullHtml, "text/html", "tmp.html")
      .getAs("application/pdf")
      .setName(fname);
    var file = folder.createFile(pdf);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return "";
  }
}

/* ═══════════════════════════════════════
   getSheet — open or create tab + write headers
   ═══════════════════════════════════════ */
function getSheet() {
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(CFG.TAB);
  if (!sh) {
    sh = ss.insertSheet(CFG.TAB);
  }
  // Write or refresh header row
  if (sh.getLastRow() === 0 || sh.getRange(1,1).getValue() === "") {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function jsonOut(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Run once manually to write headers and verify connection */
function initSheet() {
  var sh = getSheet();
  Logger.log("Connected: " + sh.getName() + " | Headers: " + HEADERS.length + " | Rows: " + sh.getLastRow());
}
