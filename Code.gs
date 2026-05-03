// ═══════════════════════════════════════════════════════════════════
// KAMINAKIA — Google Apps Script Web App  v2.0
//
//  Sheet 1: "Βιβλίο Κίνησης" — Στατικό, ΜΟΝΟ check-in, ΠΟΤΕ check-out
//           Α/Α | Ονοματεπώνυμο | Υπηκοότητα | Ημ.Γέννησης |
//           Αρ.ΔΤ/Διαβ. | Κατάλυμα | Αρ.Ατόμων | Ημ.Άφιξης | Ημ.Αναχώρησης
//           → Γράφεται μόνο αν ΔΕΝ βρεθεί στο Direct26
//
//  Sheet 2: "Housekeeping" — Δυναμικό Log, ΔΥΟ γραμμές ανά επισκέπτη
//           Timestamp | Status | Κατάλυμα | C/I Date+Time | C/O Date(Δήλωση) |
//           C/O Date+Time | Αρ.Διανυκτ. | Αρ.Ατόμων | Ονοματεπώνυμο |
//           Υπηκοότητα | Ημ.Γέννησης
//           → Check-in γραμμή στο C/I
//           → Check-out γραμμή στο C/O (νέα γραμμή, όχι update)
//
//  Διαχωρισμός Direct/Booking: ψάχνει στο "Direct26"
//           1. Κλειδώνει Κατάλυμα + Ημ.Άφιξης
//           2. Έλεγχος ονόματος: substring match (ελαστικό)
// ═══════════════════════════════════════════════════════════════════

const CFG = {
  DIRECT26_ID:      "1C7RXkr_MzPS9DJc65YkhqA8ZHa38Fjr4zUvSjvePDu8",
  VIVLIO_ID:        "1xjhW0S5UUhTxMxT52JB12ldDgh5jiklj-ViUl5S-c8s",
  HOUSEKEEPING_ID:  "12hgmzqZunxJ1IbHZf42btLuVANxFQDQW07YuBgrnfZM",
  DIRECT26_TAB:     "Direct26",
  VIVLIO_TAB:       "Βιβλίο Κίνησης",
  HOUSEKEEPING_TAB: "Housekeeping",
  TELEGRAM_TOKEN:   "8703571530:AAHf9T-20H2_RvfBHoQJ0FsJh1ieG0qENNc",
  TELEGRAM_CHAT_ID: "8520969707",
  DATE_TOLERANCE_DAYS: 1,
};

const VIVLIO_HEADERS = [
  "Α/Α","Ονοματεπώνυμο","Υπηκοότητα","Ημερομηνία Γέννησης",
  "Αρ. ΔΤ / Διαβατηρίου","Διεύθυνση","Κατάλυμα","Άτομα",
  "Ημ/νία Άφιξης","Ημ/νία Αναχ.",
];

const HK_HEADERS = [
  "Timestamp","Status","Κατάλυμα","C/I Date+Time",
  "C/O Date (Δήλωση)","C/O Date+Time","Αρ. Διανυκτερεύσεων",
  "Αρ. Ατόμων","Ονοματεπώνυμο","Υπηκοότητα","Ημερομηνία Γέννησης",
  "Διεύθυνση","Τηλέφωνο",
];

function doGet(e) {
  if (e && e.parameter && e.parameter.d) {
    try {
      // Το PWA στέλνει με btoa() — standard base64, UTF-8
      const raw  = e.parameter.d;
      // base64Decode επιστρέφει byte array → getDataAsString() → UTF-8 string
      const json = Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString("UTF-8");
      const data = JSON.parse(json);
      const type = (data.type || "").toLowerCase();
      if (type === "checkin")  return handleCheckin(data);
      if (type === "checkout") return handleCheckout(data);
      return jsonResp({ success: false, error: "Unknown type: " + type });
    } catch (err) {
      logError("doGet/data", err);
      return jsonResp({ success: false, error: String(err) });
    }
  }
  return jsonResp({ status: "ok", service: "Kaminakia v2.0", ts: new Date().toISOString() });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = (data.type || "").toLowerCase();
    if (type === "checkin")  return handleCheckin(data);
    if (type === "checkout") return handleCheckout(data);
    return jsonResp({ success: false, error: "Unknown type: " + type });
  } catch (err) {
    logError("doPost", err);
    return jsonResp({ success: false, error: String(err) });
  }
}

function handleCheckin(data) {
  const now      = new Date();
  const nowStr   = fmtDateTime(now);
  const nights   = calcNights(data.arrival, data.departure);
  const isDirect = checkIfDirect(data.name, data.apartment, data.arrival);
  const source   = isDirect ? "Direct" : "Booking.com";

  if (!isDirect) {
    const vivlio = getOrInitSheet(CFG.VIVLIO_ID, CFG.VIVLIO_TAB, VIVLIO_HEADERS, VIVLIO_STYLE);
    const nextAA = getNextAA(vivlio);
    vivlio.appendRow([
      nextAA,
      data.name        || "",
      data.nationality || "",
      fmtDate(data.dob),
      data.passport    || "",
      data.address     || "",
      data.apartment   || "",
      data.guests      || "",
      fmtDate(data.arrival),
      fmtDate(data.departure),
    ]);
    styleRow(vivlio, vivlio.getLastRow(), "#FFFFFF");
  }

  const hk = getOrInitSheet(CFG.HOUSEKEEPING_ID, CFG.HOUSEKEEPING_TAB, HK_HEADERS, HK_STYLE);
  hk.appendRow([
    nowStr,
    "✅ CHECK-IN",
    data.apartment   || "",
    nowStr,
    data.departure   || "",
    "",
    nights,
    data.guests      || "",
    data.name        || "",
    data.nationality || "",
    data.dob         || "",
    data.address     || "",
    data.phone       || "",
  ]);
  styleRow(hk, hk.getLastRow(), "#E3F2FD");

  sendPush(
    "🗝 CHECK-IN — Kaminakia",
    [
      data.apartment,
      data.name,
      data.arrival + (data.departure ? " → " + data.departure : ""),
      nights + " νύχτες · " + (data.guests || "?") + " ατ.",
      "Πηγή: " + source,
    ].join("\n")
  );

  return jsonResp({ success: true, source, type: "checkin" });
}

function handleCheckout(data) {
  const now      = new Date();
  const nowStr   = fmtDateTime(now);
  const nights   = calcNights(data.arrival, data.departure);
  const hk       = getOrInitSheet(CFG.HOUSEKEEPING_ID, CFG.HOUSEKEEPING_TAB, HK_HEADERS, HK_STYLE);
  const ciDateStr = findCheckinTimestamp(hk, data.name, data.apartment);

  hk.appendRow([
    nowStr,
    "🚪 CHECK-OUT",
    data.apartment   || "",
    ciDateStr,
    data.departure   || "",
    nowStr,
    nights,
    data.guests      || "",
    data.name        || "",
    data.nationality || "",
    data.dob         || "",
    data.address     || "",
    data.phone       || "",
  ]);
  styleRow(hk, hk.getLastRow(), "#E8F5E9");

  sendPush(
    "🚪 CHECK-OUT — Kaminakia",
    [
      data.apartment,
      data.name,
      "Αναχώρηση: " + nowStr,
      nights + " νύχτες · " + (data.guests || "?") + " ατ.",
    ].join("\n")
  );

  return jsonResp({ success: true, type: "checkout" });
}

function checkIfDirect(guestName, apartment, arrivalStr) {
  try {
    const ss    = SpreadsheetApp.openById(CFG.DIRECT26_ID);
    const sheet = ss.getSheetByName(CFG.DIRECT26_TAB);
    if (!sheet) { logError("checkIfDirect", "Tab not found: " + CFG.DIRECT26_TAB); return false; }
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return false;
    const hdrs    = rows[0].map(h => norm(String(h)));
    const ciCol   = findCol(hdrs, ["check in","checkin","αφιξη","αρριβαλ"]) ?? 0;
    const nameCol = findCol(hdrs, ["name","ονοματεπωνυμο","ονομα"])          ?? 3;
    const rmCol   = findCol(hdrs, ["room","καταλυμα","apartment","studio","κατάλυμα","unit"]) ?? -1;
    const guestNorm   = norm(guestName);
    const aptNorm     = norm(apartment);
    const arrivalDate = parseDate(arrivalStr);
    if (!arrivalDate) return false;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (rmCol !== -1) {
        const rowRoom = norm(String(row[rmCol] || ""));
        if (rowRoom && !aptNorm.includes(rowRoom) && !rowRoom.includes(aptNorm)) continue;
      }
      const rowDate = parseCellDate(row[ciCol]);
      if (!rowDate) continue;
      const diffDays = Math.abs((arrivalDate - rowDate) / 86400000);
      if (diffDays > CFG.DATE_TOLERANCE_DAYS) continue;
      const rowName = norm(String(row[nameCol] || ""));
      if (!rowName) continue;
      if (nameSubstringMatch(guestNorm, rowName)) return true;
    }
    return false;
  } catch (err) {
    logError("checkIfDirect", err);
    return false;
  }
}

function nameSubstringMatch(a, b) {
  const wordsA = a.split(/\s+/).filter(w => w.length >= 3);
  const wordsB = b.split(/\s+/).filter(w => w.length >= 3);
  return wordsA.some(wa => b.includes(wa)) || wordsB.some(wb => a.includes(wb));
}

function findCheckinTimestamp(sheet, guestName, apartment) {
  try {
    const data  = sheet.getDataRange().getValues();
    const gNorm = norm(guestName);
    const aNorm = norm(apartment);
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (!String(row[1] || "").includes("CHECK-IN")) continue;
      const rowApt  = norm(String(row[2] || ""));
      const rowName = norm(String(row[8] || ""));
      if (rowApt === aNorm && nameSubstringMatch(gNorm, rowName)) return String(row[3] || "");
    }
  } catch (err) { logError("findCheckinTimestamp", err); }
  return "";
}

const VIVLIO_STYLE = { headerBg: "#1A237E", headerFg: "#FFFFFF" };
const HK_STYLE     = { headerBg: "#2E7D32", headerFg: "#FFFFFF" };

function getOrInitSheet(sheetId, tabName, headers, style) {
  const ss    = SpreadsheetApp.openById(sheetId);
  let   sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    const hr = sheet.getRange(1,1,1,headers.length);
    hr.setValues([headers]);
    hr.setBackground(style.headerBg);
    hr.setFontColor(style.headerFg);
    hr.setFontWeight("bold");
    hr.setFontSize(10);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function fmtDate(str) {
  if (!str) return "";
  const d = parseDate(str);
  if (!d) return str;
  const p = n => String(n).padStart(2,"0");
  return p(d.getDate()) + "/" + p(d.getMonth()+1) + "/" + d.getFullYear();
}

function fmtDateTime(d) {
  const p = n => String(n).padStart(2,"0");
  return p(d.getDate()) + "/" + p(d.getMonth()+1) + "/" + d.getFullYear()
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function styleRow(sheet, rowNum, bg) {
  sheet.getRange(rowNum,1,1,sheet.getLastColumn()).setBackground(bg);
}

function getNextAA(sheet) {
  const last = sheet.getLastRow();
  return last <= 1 ? 1 : last;
}

function parseDate(str) {
  if (!str) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str.slice(0,10) + "T12:00:00");
      return isNaN(d) ? null : d;
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
      const [dd,mm,yy] = str.split("/");
      return new Date(yy + "-" + mm + "-" + dd + "T12:00:00");
    }
    const d = new Date(str);
    return isNaN(d) ? null : d;
  } catch { return null; }
}

function parseCellDate(cell) {
  if (!cell) return null;
  if (cell instanceof Date && !isNaN(cell)) return cell;
  return parseDate(String(cell));
}

function calcNights(arrival, departure) {
  const a = parseDate(arrival);
  const d = parseDate(departure);
  if (!a || !d) return "";
  const n = Math.round((d-a)/86400000);
  return n > 0 ? n : "";
}

function norm(s) {
  return (s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zα-ωά-ώ\s]/gi," ")
    .replace(/\s+/g," ").trim();
}

function findCol(hdrs, candidates) {
  for (const c of candidates) {
    const i = hdrs.findIndex(h => h.includes(c));
    if (i !== -1) return i;
  }
  return null;
}

function sendPush(title, body) {
  try {
    const text = "*" + escMd(title) + "*\n" + escMd(body);
    UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CFG.TELEGRAM_TOKEN + "/sendMessage",
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        payload: JSON.stringify({ chat_id: CFG.TELEGRAM_CHAT_ID, text, parse_mode: "MarkdownV2" }),
      }
    );
  } catch (err) { logError("sendPush", err); }
}

function escMd(s) {
  return String(s||"").replace(/[_*\[\]()~`>#+\-=|{}.!]/g,"\\$&");
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logError(fn, err) {
  console.error("[Kaminakia] " + fn + ": " + String(err));
}

function getChatId() {
  const url  = "https://api.telegram.org/bot" + CFG.TELEGRAM_TOKEN + "/getUpdates";
  const resp = UrlFetchApp.fetch(url);
  const data = JSON.parse(resp.getContentText());
  if (data.ok && data.result.length > 0) {
    const msg = data.result[data.result.length-1];
    const id  = msg.message?.chat?.id || msg.channel_post?.chat?.id;
    console.log("✅ Chat ID:", id);
  } else {
    console.log("⚠️ Στείλε πρώτα ένα μήνυμα στο bot σου.");
  }
}

function testSheetAccess() {
  try {
    const vivlio = SpreadsheetApp.openById(CFG.VIVLIO_ID);
    Logger.log("✅ Βιβλίο Κίνησης: " + vivlio.getName());
    const hk = SpreadsheetApp.openById(CFG.HOUSEKEEPING_ID);
    Logger.log("✅ Housekeeping: " + hk.getName());
    const d26 = SpreadsheetApp.openById(CFG.DIRECT26_ID);
    Logger.log("✅ Direct26: " + d26.getName());
    const vivlioTab = vivlio.getSheetByName(CFG.VIVLIO_TAB);
    Logger.log(vivlioTab ? "✅ Tab '" + CFG.VIVLIO_TAB + "' OK" : "❌ Tab ΔΕΝ βρέθηκε — tabs: " + vivlio.getSheets().map(s=>s.getName()).join(", "));
    const hkTab = hk.getSheetByName(CFG.HOUSEKEEPING_TAB);
    Logger.log(hkTab ? "✅ Tab '" + CFG.HOUSEKEEPING_TAB + "' OK" : "❌ Tab ΔΕΝ βρέθηκε — tabs: " + hk.getSheets().map(s=>s.getName()).join(", "));
  } catch(err) {
    Logger.log("❌ ΣΦΑΛΜΑ: " + err);
  }
}

function testCheckin_Booking() {
  handleCheckin({ type:"checkin", name:"Schmidt Hans", passport:"D8765432",
    nationality:"German", phone:"+49 151 1234567", apartment:"Apartment 3",
    guests:"2", arrival:"2025-07-20", departure:"2025-07-27",
    address:"Berlin, Germany", dob:"" });
  console.log("✅ Test Booking checkin done");
}

function testCheckin_Direct() {
  handleCheckin({ type:"checkin", name:"Παπαδόπουλος Γιώργης", passport:"ΑΒ123456",
    nationality:"Greek", phone:"+30 69 1234 5678", apartment:"Apartment 1",
    guests:"3", arrival:"2025-07-01", departure:"2025-07-08",
    address:"Αθήνα", dob:"" });
  console.log("✅ Test Direct checkin done — μόνο Housekeeping");
}

function testCheckout() {
  handleCheckout({ type:"checkout", name:"Schmidt Hans", apartment:"Apartment 3",
    guests:"2", arrival:"2025-07-20", departure:"2025-07-27",
    nationality:"German", dob:"" });
  console.log("✅ Test checkout done");
}
