const RAWVALID_SHEET_NAME  = 'RawValid';
const MEDDATA_SHEET_NAME   = 'MedData';
const SYNCSTATE_SHEET_NAME = 'SyncState';

function normText_(s) {
  return String(s || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

function findHeaderIndex_(headers, candidates) {
  const normHeaders = headers.map(normText_);
  for (const c of candidates) {
    const idx = normHeaders.indexOf(normText_(c));
    if (idx >= 0) return idx + 1;
  }
  return 0;
}

function columnToLetter_(column) {
  let temp = '';
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function getSheetByNameStrict_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Không tìm thấy sheet: ' + name);
  return sh;
}

function getOrCreateSyncState_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SYNCSTATE_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SYNCSTATE_SHEET_NAME);
    sh.getRange(1, 1, 1, 2).setValues([['KEY', 'SYNCED_AT']]);
    sh.hideSheet();
  }
  return sh;
}

function buildSyncKey_(ts, code, name) {
  const t = Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [t, String(code || '').trim(), String(name || '').trim()].join('|');
}

function getProcessedSet_() {
  const sh = getOrCreateSyncState_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Set();
  const values = sh.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  return new Set(values.map(x => String(x || '').trim()).filter(Boolean));
}

function markProcessed_(key) {
  const sh = getOrCreateSyncState_();
  sh.appendRow([key, new Date()]);
}

function ensureStatusFormula_(medSh, idxHSD, idxTrangThai) {
  if (idxTrangThai <= 0 || idxHSD <= 0) return;
  const cell = medSh.getRange(2, idxTrangThai);
  if (cell.getFormula()) return;

  const col = columnToLetter_(idxHSD);
  cell.setFormula(
    `=ARRAYFORMULA(IF(${col}2:${col}="","",IF(INT(${col}2:${col})<TODAY(),"Hết hạn",IF(INT(${col}2:${col})<=TODAY()+30,"Sắp hết hạn","Còn hạn"))))`
  );
}

function syncRawValidToMedData_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const rawSh = getSheetByNameStrict_(RAWVALID_SHEET_NAME);
    const medSh = getSheetByNameStrict_(MEDDATA_SHEET_NAME);

    const rawLastRow = rawSh.getLastRow();
    if (rawLastRow < 2) return;

    const rawValues = rawSh.getRange(2, 1, rawLastRow - 1, 3).getValues();
    const done = getProcessedSet_();

    const headers = medSh.getRange(1, 1, 1, medSh.getLastColumn()).getValues()[0];
    const idxName      = findHeaderIndex_(headers, ['TÊN THUỐC GỐC', 'TEN THUOC GOC']);
    const idxAlias     = findHeaderIndex_(headers, ['ALIAS']);
    const idxSoLuong   = findHeaderIndex_(headers, ['SỐ LƯỢNG', 'SO LUONG']);
    const idxHSD       = findHeaderIndex_(headers, ['HSD']);
    const idxMaSp      = findHeaderIndex_(headers, ['MÃ SẢN PHẨM', 'MA SAN PHAM']);
    const idxNgayNhap  = findHeaderIndex_(headers, ['NGÀY NHẬP', 'NGAY NHAP']);
    const idxTrangThai = findHeaderIndex_(headers, ['TRẠNG THÁI', 'TRANG THAI']);

    if (idxName <= 0 || idxMaSp <= 0 || idxNgayNhap <= 0) {
      throw new Error('MedData thiếu cột bắt buộc');
    }

    for (const row of rawValues) {
      const ts   = row[0];
      const code = String(row[1] || '').trim();
      const name = String(row[2] || '').trim();

      if (!ts || !code || !name) continue;

      const key = buildSyncKey_(ts, code, name);
      if (done.has(key)) continue;

      const newRow = medSh.getLastRow() + 1;

      medSh.getRange(newRow, idxName).setValue(name);
      if (idxAlias > 0)   medSh.getRange(newRow, idxAlias).setValue('');
      if (idxSoLuong > 0) medSh.getRange(newRow, idxSoLuong).setValue(1);
      if (idxHSD > 0)     medSh.getRange(newRow, idxHSD).setValue('');
      medSh.getRange(newRow, idxMaSp).setValue(code);
      medSh.getRange(newRow, idxNgayNhap).setValue(new Date(ts));
      medSh.getRange(newRow, idxNgayNhap).setNumberFormat('d/M/yyyy');

      ensureStatusFormula_(medSh, idxHSD, idxTrangThai);

      markProcessed_(key);
      done.add(key);
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function syncNow_() {
  syncRawValidToMedData_();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Medicate Sync')
    .addItem('Sync ngay bây giờ', 'syncNow_')
    .addToUi();
}
