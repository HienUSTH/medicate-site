(function () {
  const sb = window.medicateSupabase || window.medicateAuthState?.supabase || null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
  const norm = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const state = {
    user: null,
    cabinetId: null,
    inventory: [],
    trash: [],
    catalog: [],
    reminders: [],
    filter: 'all',
    search: '',
    qtyMax: 10,
    editingId: null,
    detailId: null,
    reminderMedicineId: null
  };

  const ui = {
    tableBody: $('tableBody'),
    searchInput: $('searchInput'),
    qtySlider: $('qtySlider'),
    qtyVal: $('qtyVal'),
    btnBulkDelete: $('btnBulkDelete'),
    btnOpenTrash: $('btnOpenTrash'),

    formAddDrug: $('formAddDrug'),
    addTen: $('addTen'),
    addBarcode: $('addBarcode'),
    addSL: $('addSL'),
    addHSD: $('addHSD'),
    addNgayNhap: $('addNgayNhap'),
    addMsg: $('addMsg'),
    btnClearAdd: $('btnClearAdd'),
    barcodeMsg: $('barcodeMsg'),
    btnResolveBarcode: $('btnResolveBarcode'),

    globalRemindersList: $('globalRemindersList'),
    btnReloadGlobalReminders: $('btnReloadGlobalReminders'),

    detailModal: $('detailModal'),
    btnCloseDetail: $('btnCloseDetail'),
    detailDrugName: $('detailDrugName'),
    detailBarcode: $('detailBarcode'),
    detailExpiry: $('detailExpiry'),
    detailMfg: $('detailMfg'),
    detailLot: $('detailLot'),
    detailQuantity: $('detailQuantity'),
    detailImportedAt: $('detailImportedAt'),
    detailStatus: $('detailStatus'),
    detailComposition: $('detailComposition'),
    detailSourceText: $('detailSourceText'),
    detailUsageText: $('detailUsageText'),
    detailCautionText: $('detailCautionText'),
    detailStorageText: $('detailStorageText'),
    detailNote: $('detailNote'),
    detailPanelScans: $('detailPanelScans'),

    editModal: $('editModal'),
    btnCloseEdit: $('btnCloseEdit'),
    editDrugName: $('editDrugName'),
    editBarcode: $('editBarcode'),
    editSL: $('editSL'),
    editHSD: $('editHSD'),
    editMFG: $('editMFG'),
    editLot: $('editLot'),
    editNgayNhap: $('editNgayNhap'),
    editComposition: $('editComposition'),
    editSourceText: $('editSourceText'),
    editUsageText: $('editUsageText'),
    editCautionText: $('editCautionText'),
    editStorageText: $('editStorageText'),
    editNote: $('editNote'),
    editStatus: $('editStatus'),
    btnSaveEdit: $('btnSaveEdit'),

    reminderModal: $('reminderModal'),
    btnCloseReminder: $('btnCloseReminder'),
    remDrugName: $('remDrugName'),
    remDoseText: $('remDoseText'),
    remTimesContainer: $('remTimesContainer'),
    btnAddRemTime: $('btnAddRemTime'),
    remRepeatType: $('remRepeatType'),
    remEmail: $('remEmail'),
    remExistingList: $('remExistingList'),
    remStatus: $('remStatus'),
    btnSaveReminder: $('btnSaveReminder'),

    trashModal: $('trashModal'),
    btnCloseTrash: $('btnCloseTrash'),
    btnEmptyTrash: $('btnEmptyTrash'),
    trashBody: $('trashBody')
  };

  function setMessage(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.id === 'addMsg' ? 'text-xs ml-auto ' : 'text-xs mt-1 ') + (ok ? 'text-emerald-700' : 'text-rose-600');
  }

  function setHint(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-xs ' + (ok ? 'text-emerald-700' : 'text-rose-600');
  }

  function parseDateInput(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    const formats = ['DD/MM/YYYY', 'D/M/YYYY', 'DD-MM-YYYY', 'D-M-YYYY', 'YYYY-MM-DD'];
    for (const f of formats) {
      const d = window.dayjs?.(v, f, true);
      if (d && d.isValid()) return d.format('YYYY-MM-DD');
    }
    const d = window.dayjs?.(v);
    return d && d.isValid() ? d.format('YYYY-MM-DD') : null;
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = window.dayjs?.(value);
    return d && d.isValid() ? d.format('DD/MM/YYYY') : '—';
  }

  function formatDays(value) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '—';
  }

  function badgeClass(status) {
    switch (status) {
      case 'Còn hạn':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'Sắp hết hạn':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'Hết hạn':
        return 'bg-rose-100 text-rose-700 border border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
  }

  function reminderBadgeClass(enabled) {
    return enabled
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      : 'bg-slate-100 text-slate-600 border border-slate-200';
  }

  function packagingBadge(scanStatus) {
    switch (scanStatus) {
      case 'done':
        return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-sky-100 text-sky-700 border border-sky-200">Bao bì: xong</span>';
      case 'partial':
        return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700 border border-amber-200">Bao bì: một phần</span>';
      case 'needs_review':
        return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700 border border-rose-200">Bao bì: cần xem lại</span>';
      default:
        return '';
    }
  }

  function statusToFilter(status) {
    if (status === 'Còn hạn') return 'ok';
    if (status === 'Sắp hết hạn') return 'soon';
    if (status === 'Hết hạn') return 'expired';
    return 'all';
  }

  function openModal(el) { el?.classList.remove('hidden'); }
  function closeModal(el) { el?.classList.add('hidden'); }

  function safeJsonObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? JSON.parse(JSON.stringify(value))
      : {};
  }

  function setMergedField(payload, key, value, sourceType = 'web_edit') {
    const next = safeJsonObject(payload);
    next.merged_fields = safeJsonObject(next.merged_fields);

    if (!String(value || '').trim()) {
      delete next.merged_fields[key];
      return next;
    }

    next.merged_fields[key] = {
      value: String(value || '').trim(),
      source_type: sourceType,
      confidence: 0.95,
      needs_review: false
    };
    return next;
  }

  function buildPackageInfoPayload(basePayload, form) {
    let next = safeJsonObject(basePayload);
    next = setMergedField(next, 'product_name', form.name);
    next = setMergedField(next, 'ingredients_text', form.composition);
    next = setMergedField(next, 'usage_text', form.usage);
    next = setMergedField(next, 'storage_text', form.storage);

    const sourceLines = String(form.sourceText || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    next = setMergedField(next, 'registration_no', sourceLines[0] || '');
    next = setMergedField(next, 'manufacturer_name', sourceLines[1] || '');
    next = setMergedField(next, 'registrant_name', sourceLines[2] || '');
    next = setMergedField(next, 'country_of_origin', sourceLines.slice(3).join('\n'));

    const cautionLines = String(form.caution || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    next = setMergedField(next, 'contraindications_text', cautionLines[0] || '');
    next = setMergedField(next, 'warnings_text', cautionLines.slice(1).join('\n'));

    next.updated_from = 'website_edit';
    next.updated_at = new Date().toISOString();
    return next;
  }

  function anyDetailFilled(form) {
    return [
      form.composition,
      form.sourceText,
      form.usage,
      form.caution,
      form.storage
    ].some((v) => String(v || '').trim());
  }

  function updateQtySliderMax() {
    const maxQty = Math.max(10, ...state.inventory.map((x) => Number(x.quantity) || 0));
    state.qtyMax = maxQty;
    if (ui.qtySlider) {
      ui.qtySlider.max = String(maxQty);
      if (Number(ui.qtySlider.value) > maxQty || !ui.qtySlider.value) ui.qtySlider.value = String(maxQty);
      if (ui.qtyVal) ui.qtyVal.textContent = ui.qtySlider.value;
    }
  }

  function getFilteredInventory() {
    const search = norm(state.search);
    const qtyLimit = Number(ui.qtySlider?.value || state.qtyMax || 10);

    return state.inventory.filter((item) => {
      const itemFilter = statusToFilter(item.status);
      const matchesFilter = state.filter === 'all' ? true : itemFilter === state.filter;
      const qty = Number(item.quantity) || 0;
      const matchesQty = qty <= qtyLimit;
      const hay = norm([
        item.medicine_name,
        item.barcode,
        item.note,
        item.source,
        item.composition_text,
        item.source_text,
        item.usage_combined_text,
        item.caution_text,
        item.storage_group_text
      ].filter(Boolean).join(' '));
      const matchesSearch = !search || hay.includes(search);
      return matchesFilter && matchesQty && matchesSearch;
    });
  }

  function renderInventory() {
    if (!ui.tableBody) return;
    const rows = getFilteredInventory();

    if (!rows.length) {
      ui.tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="px-4 py-8 text-center text-slate-500">
            Chưa có thuốc nào khớp bộ lọc hiện tại.
          </td>
        </tr>
      `;
      return;
    }

    ui.tableBody.innerHTML = rows.map((item) => {
      const barcode = item.barcode ? esc(item.barcode) : '—';
      const noteLine = item.note ? `<div class="text-[11px] text-slate-500 mt-1">${esc(item.note)}</div>` : '';
      const sourceLabel = item.info_source || item.source ? `${esc(item.info_source || item.source)}` : '';
      const packBadge = packagingBadge(item.packaging_scan_status);
      return `
        <tr>
          <td class="px-3 py-3 align-top">
            <div class="font-semibold text-slate-800 break-words">${esc(item.medicine_name)}</div>
            <div class="flex flex-wrap gap-1 mt-2">
              ${sourceLabel ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 border border-slate-200">${sourceLabel}</span>` : ''}
              ${packBadge}
            </div>
            ${noteLine}
            <div class="flex flex-wrap gap-1 mt-2">
              <button data-action="detail" data-id="${item.id}" class="px-2 py-1 rounded-full border border-sky-300 text-sky-700 text-xs hover:bg-sky-50">Chi tiết</button>
              <button data-action="edit" data-id="${item.id}" class="px-2 py-1 rounded-full border border-slate-300 text-xs hover:bg-slate-50">Sửa</button>
              <button data-action="reminder" data-id="${item.id}" class="px-2 py-1 rounded-full border border-amber-300 text-amber-700 text-xs hover:bg-amber-50">Hẹn giờ</button>
              <button data-action="delete" data-id="${item.id}" class="px-2 py-1 rounded-full border border-rose-300 text-rose-700 text-xs hover:bg-rose-50">Xóa</button>
            </div>
          </td>
          <td class="px-3 py-3 align-top break-all">${barcode}</td>
          <td class="px-3 py-3 align-top text-right mono">${Number(item.quantity) || 0}</td>
          <td class="px-3 py-3 align-top">${formatDate(item.expiry_date)}</td>
          <td class="px-3 py-3 align-top">${formatDate(item.imported_at)}</td>
          <td class="px-3 py-3 align-top text-center">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${badgeClass(item.status)}">
              ${esc(item.status || 'Chưa rõ')}
            </span>
          </td>
          <td class="px-3 py-3 align-top text-right mono">${formatDays(item.days_remaining)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderRecentReminders() {
    if (!ui.globalRemindersList) return;
    const byMedId = new Map(state.inventory.map((x) => [x.id, x]));
    const rows = state.reminders
      .filter((x) => !x.deleted_at)
      .sort((a, b) => String(a.remind_time).localeCompare(String(b.remind_time)));

    if (!rows.length) {
      ui.globalRemindersList.innerHTML = '';
      return;
    }

    ui.globalRemindersList.innerHTML = rows.map((item) => {
      const med = byMedId.get(item.user_medicine_id);
      const title = med?.medicine_name || item.user_medicine_id || 'Thuốc';
      const dose = item.dose_text ? `<div class="text-[11px] text-slate-500 mt-0.5">${esc(item.dose_text)}</div>` : '';
      return `
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="font-medium text-slate-800">${esc(title)}</div>
              ${dose}
            </div>
            <div class="text-right">
              <div class="font-semibold mono">${esc(item.remind_time)}</div>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${reminderBadgeClass(item.enabled)}">
                ${item.enabled ? 'Bật' : 'Tắt'}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTrash() {
    if (!ui.trashBody) return;
    if (!state.trash.length) {
      ui.trashBody.innerHTML = `
        <tr>
          <td colspan="5" class="px-3 py-6 text-center text-slate-500">Thùng rác đang trống.</td>
        </tr>
      `;
      return;
    }

    ui.trashBody.innerHTML = state.trash.map((item) => `
      <tr class="border-t">
        <td class="px-3 py-2">${formatDate(item.deleted_at)}</td>
        <td class="px-3 py-2">Thuốc</td>
        <td class="px-3 py-2">
          <div class="font-medium">${esc(item.custom_name || 'Chưa đặt tên')}</div>
          <div class="text-xs text-slate-500 break-all">${esc(item.barcode || '—')}</div>
        </td>
        <td class="px-3 py-2">Đã xóa mềm</td>
        <td class="px-3 py-2 text-right">
          <div class="inline-flex gap-1">
            <button data-trash-action="restore" data-id="${item.id}" class="px-2 py-1 rounded border border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50">Khôi phục</button>
            <button data-trash-action="delete-forever" data-id="${item.id}" class="px-2 py-1 rounded border border-rose-300 text-rose-700 text-xs hover:bg-rose-50">Xóa hẳn</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderPanelScans(panelScans) {
    if (!ui.detailPanelScans) return;
    const rows = Array.isArray(panelScans) ? panelScans : [];
    if (!rows.length) {
      ui.detailPanelScans.innerHTML = '<div class="text-slate-500">Chưa có mặt hộp nào được lưu.</div>';
      return;
    }

    ui.detailPanelScans.innerHTML = rows.map((panel) => {
      const parsed = panel?.parsed_json && typeof panel.parsed_json === 'object'
        ? `<pre class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white border border-slate-200 p-2">${esc(JSON.stringify(panel.parsed_json, null, 2))}</pre>`
        : '';
      return `
        <div class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="font-medium capitalize">${esc(panel.panel_type || 'panel')}</div>
            <div class="text-[11px] text-slate-500">${formatDate(panel.created_at)}</div>
          </div>
          <div class="mt-2 text-xs text-slate-600 whitespace-pre-wrap break-words">${esc(panel.ocr_text || '')}</div>
          ${parsed}
        </div>
      `;
    }).join('');
  }

  function fillDetailModal(item) {
    state.detailId = item.id;
    if (ui.detailDrugName) ui.detailDrugName.textContent = item.medicine_name || '—';
    if (ui.detailBarcode) ui.detailBarcode.textContent = item.barcode || '—';
    if (ui.detailExpiry) ui.detailExpiry.textContent = formatDate(item.expiry_date);
    if (ui.detailMfg) ui.detailMfg.textContent = formatDate(item.mfg_date);
    if (ui.detailLot) ui.detailLot.textContent = item.lot_number || '—';
    if (ui.detailQuantity) ui.detailQuantity.textContent = String(Number(item.quantity) || 0);
    if (ui.detailImportedAt) ui.detailImportedAt.textContent = formatDate(item.imported_at);
    if (ui.detailStatus) ui.detailStatus.textContent = item.status || 'Chưa rõ';
    if (ui.detailComposition) ui.detailComposition.value = item.composition_text || '';
    if (ui.detailSourceText) ui.detailSourceText.value = item.source_text || '';
    if (ui.detailUsageText) ui.detailUsageText.value = item.usage_combined_text || '';
    if (ui.detailCautionText) ui.detailCautionText.value = item.caution_text || '';
    if (ui.detailStorageText) ui.detailStorageText.value = item.storage_group_text || '';
    if (ui.detailNote) ui.detailNote.value = item.note || '';
    renderPanelScans(item.panel_scans);
  }

  function fillEditModal(item) {
    state.editingId = item.id;
    if (ui.editDrugName) ui.editDrugName.value = item.medicine_name || '';
    if (ui.editBarcode) ui.editBarcode.value = item.barcode || '';
    if (ui.editSL) ui.editSL.value = Number(item.quantity) || 0;
    if (ui.editHSD) ui.editHSD.value = formatDate(item.expiry_date) === '—' ? '' : formatDate(item.expiry_date);
    if (ui.editMFG) ui.editMFG.value = formatDate(item.mfg_date) === '—' ? '' : formatDate(item.mfg_date);
    if (ui.editLot) ui.editLot.value = item.lot_number || '';
    if (ui.editNgayNhap) ui.editNgayNhap.value = formatDate(item.imported_at) === '—' ? '' : formatDate(item.imported_at);
    if (ui.editComposition) ui.editComposition.value = item.composition_text || '';
    if (ui.editSourceText) ui.editSourceText.value = item.source_text || '';
    if (ui.editUsageText) ui.editUsageText.value = item.usage_combined_text || '';
    if (ui.editCautionText) ui.editCautionText.value = item.caution_text || '';
    if (ui.editStorageText) ui.editStorageText.value = item.storage_group_text || '';
    if (ui.editNote) ui.editNote.value = item.note || '';
    setHint(ui.editStatus, `Trạng thái: ${item.status || 'Chưa rõ'} • Còn: ${formatDays(item.days_remaining)} ngày`, true);
  }

  function clearAddForm() {
    ui.formAddDrug?.reset();
    if (ui.addSL) ui.addSL.value = '';
    if (ui.addNgayNhap) ui.addNgayNhap.value = '';
    setMessage(ui.addMsg, '');
  }

  function createTimeRow(value = '') {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-2';
    wrap.innerHTML = `
      <input type="time" value="${esc(value)}" class="rem-time-input flex-1 px-3 py-2 rounded-lg border border-slate-300" />
      <button type="button" class="btn-remove-time px-3 py-2 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm">Xóa</button>
    `;
    wrap.querySelector('.btn-remove-time')?.addEventListener('click', () => wrap.remove());
    return wrap;
  }

  function collectReminderTimes() {
    return [...(ui.remTimesContainer?.querySelectorAll('.rem-time-input') || [])]
      .map((input) => String(input.value || '').trim())
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .sort();
  }

  function fillReminderModal(item) {
    state.reminderMedicineId = item.id;
    if (ui.remDrugName) ui.remDrugName.value = item.medicine_name || '';
    if (ui.remDoseText) ui.remDoseText.value = '';
    if (ui.remEmail) ui.remEmail.value = state.user?.email || '';
    if (ui.remRepeatType) ui.remRepeatType.value = 'daily';
    if (ui.remTimesContainer) {
      ui.remTimesContainer.innerHTML = '';
      ui.remTimesContainer.appendChild(createTimeRow('08:00'));
    }
    setHint(ui.remStatus, '', true);
  }

  function renderMedicineReminders(medicineId) {
    if (!ui.remExistingList) return;
    const rows = state.reminders
      .filter((x) => x.user_medicine_id === medicineId && !x.deleted_at)
      .sort((a, b) => String(a.remind_time).localeCompare(String(b.remind_time)));

    if (!rows.length) {
      ui.remExistingList.innerHTML = '<div class="text-slate-500">Chưa có giờ nhắc nào.</div>';
      return;
    }

    ui.remExistingList.innerHTML = rows.map((item) => `
      <div class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div class="font-medium mono">${esc(item.remind_time)}</div>
          <div class="text-[11px] text-slate-500">${esc(item.repeat_rule || 'daily')}${item.dose_text ? ' • ' + esc(item.dose_text) : ''}</div>
        </div>
        <div class="flex items-center gap-1">
          <button data-rem-action="toggle" data-id="${item.id}" class="px-2 py-1 rounded border border-slate-300 text-xs hover:bg-slate-100">
            ${item.enabled ? 'Tắt' : 'Bật'}
          </button>
          <button data-rem-action="delete" data-id="${item.id}" class="px-2 py-1 rounded border border-rose-300 text-rose-700 text-xs hover:bg-rose-50">
            Xóa
          </button>
        </div>
      </div>
    `).join('');
  }

  function resolveCatalogIdByName(name) {
    const key = norm(name);
    const hit = state.catalog.find((item) => norm(item.name) === key);
    return hit?.id || null;
  }

  async function fetchSessionUser() {
    const sessionRes = await sb.auth.getSession();
    const user = sessionRes?.data?.session?.user || null;
    state.user = user;
    return user;
  }

  async function fetchCabinet() {
    if (!state.user) return null;
    const { data, error } = await sb
      .from('cabinets')
      .select('id, cabinet_name')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw error;
    state.cabinetId = data?.[0]?.id || null;
    return state.cabinetId;
  }

  async function loadInventory() {
    const { data, error } = await sb
      .from('v_inventory_detail')
      .select('*')
      .order('imported_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    state.inventory = data || [];
    updateQtySliderMax();
    renderInventory();
  }

  async function loadCatalog() {
    const { data, error } = await sb
      .from('medicine_catalog')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    state.catalog = data || [];
  }

  async function loadTrash() {
    const { data, error } = await sb
      .from('user_medicines')
      .select('id, custom_name, barcode, deleted_at, quantity, expiry_date, imported_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;
    state.trash = data || [];
    renderTrash();
  }

  async function loadReminders() {
    const { data, error } = await sb
      .from('reminders')
      .select('id, user_id, user_medicine_id, remind_time, repeat_rule, enabled, dose_text, notify_email, channel, updated_at, deleted_at')
      .order('remind_time', { ascending: true });

    if (error) throw error;
    state.reminders = data || [];
    renderRecentReminders();
    if (state.reminderMedicineId) renderMedicineReminders(state.reminderMedicineId);
  }

  async function addMedicine(event) {
    event.preventDefault();
    if (!state.user) {
      setMessage(ui.addMsg, 'Bạn cần đăng nhập trước.', false);
      return;
    }

    const name = String(ui.addTen?.value || '').trim();
    const barcode = String(ui.addBarcode?.value || '').trim();
    const quantity = Number(ui.addSL?.value || 0);
    const expiryDate = parseDateInput(ui.addHSD?.value);
    const importedAt = parseDateInput(ui.addNgayNhap?.value) || window.dayjs().format('YYYY-MM-DD');

    if (!name) {
      setMessage(ui.addMsg, 'Tên thuốc là bắt buộc.', false);
      ui.addTen?.focus();
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setMessage(ui.addMsg, 'Số lượng phải là số không âm.', false);
      ui.addSL?.focus();
      return;
    }
    if (ui.addHSD?.value && !expiryDate) {
      setMessage(ui.addMsg, 'HSD chưa đúng định dạng.', false);
      ui.addHSD?.focus();
      return;
    }
    if (ui.addNgayNhap?.value && !parseDateInput(ui.addNgayNhap.value)) {
      setMessage(ui.addMsg, 'Ngày nhập chưa đúng định dạng.', false);
      ui.addNgayNhap?.focus();
      return;
    }

    setMessage(ui.addMsg, 'Đang lưu...', true);

    const payload = {
      user_id: state.user.id,
      cabinet_id: state.cabinetId,
      catalog_id: resolveCatalogIdByName(name),
      custom_name: name,
      barcode: barcode || null,
      quantity,
      expiry_date: expiryDate,
      imported_at: importedAt,
      source: barcode ? 'barcode' : 'manual',
      info_source: barcode ? 'barcode_lookup' : 'manual',
      packaging_scan_status: 'not_scanned',
      barcode_lookup_payload: barcode ? { barcode, resolved_name: name, source: 'website_add' } : {},
      package_info_payload: {}
    };

    const { error } = await sb.from('user_medicines').insert(payload);
    if (error) {
      console.error(error);
      setMessage(ui.addMsg, `Lưu thất bại: ${error.message}`, false);
      return;
    }

    clearAddForm();
    setMessage(ui.addMsg, 'Đã thêm thuốc vào Supabase.', true);
    await loadInventory();
  }

  async function saveEdit() {
    if (!state.editingId) return;
    const original = state.inventory.find((x) => x.id === state.editingId);
    if (!original) return;

    const form = {
      name: String(ui.editDrugName?.value || '').trim(),
      barcode: String(ui.editBarcode?.value || '').trim(),
      quantity: Number(ui.editSL?.value || 0),
      expiryDate: parseDateInput(ui.editHSD?.value),
      mfgDate: parseDateInput(ui.editMFG?.value),
      lotNumber: String(ui.editLot?.value || '').trim(),
      importedAt: parseDateInput(ui.editNgayNhap?.value),
      composition: String(ui.editComposition?.value || '').trim(),
      sourceText: String(ui.editSourceText?.value || '').trim(),
      usage: String(ui.editUsageText?.value || '').trim(),
      caution: String(ui.editCautionText?.value || '').trim(),
      storage: String(ui.editStorageText?.value || '').trim(),
      note: String(ui.editNote?.value || '').trim()
    };

    if (!form.name) {
      setHint(ui.editStatus, 'Tên thuốc là bắt buộc.', false);
      ui.editDrugName?.focus();
      return;
    }
    if (!Number.isFinite(form.quantity) || form.quantity < 0) {
      setHint(ui.editStatus, 'Số lượng phải là số không âm.', false);
      ui.editSL?.focus();
      return;
    }
    if (ui.editHSD?.value && !form.expiryDate) {
      setHint(ui.editStatus, 'HSD chưa đúng định dạng.', false);
      ui.editHSD?.focus();
      return;
    }
    if (ui.editMFG?.value && !form.mfgDate) {
      setHint(ui.editStatus, 'NSX chưa đúng định dạng.', false);
      ui.editMFG?.focus();
      return;
    }
    if (!form.importedAt) {
      setHint(ui.editStatus, 'Ngày nhập là bắt buộc và phải đúng định dạng.', false);
      ui.editNgayNhap?.focus();
      return;
    }

    setHint(ui.editStatus, 'Đang lưu thay đổi...', true);

    const packageInfoPayload = buildPackageInfoPayload(original.package_info_payload, form);
    const hasDetail = anyDetailFilled(form);

    const updatePayload = {
      custom_name: form.name,
      barcode: form.barcode || null,
      catalog_id: resolveCatalogIdByName(form.name),
      quantity: form.quantity,
      expiry_date: form.expiryDate,
      mfg_date: form.mfgDate,
      lot_number: form.lotNumber || null,
      imported_at: form.importedAt,
      note: form.note || null,
      info_source: hasDetail ? 'web_edit' : (original.info_source || 'manual'),
      packaging_scan_status: hasDetail ? 'done' : (original.packaging_scan_status || 'not_scanned'),
      package_info_payload: packageInfoPayload,
      last_verified_at: new Date().toISOString()
    };

    const { error } = await sb
      .from('user_medicines')
      .update(updatePayload)
      .eq('id', state.editingId);

    if (error) {
      console.error(error);
      setHint(ui.editStatus, `Lưu thất bại: ${error.message}`, false);
      return;
    }

    closeModal(ui.editModal);
    state.editingId = null;
    await loadInventory();
  }

  async function softDelete(ids) {
    if (!ids.length) return;
    const { error } = await sb
      .from('user_medicines')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  }

  async function restoreOne(id) {
    const { error } = await sb
      .from('user_medicines')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw error;
  }

  async function hardDelete(ids) {
    if (!ids.length) return;
    const { error } = await sb
      .from('user_medicines')
      .delete()
      .in('id', ids);
    if (error) throw error;
  }

  async function toggleReminder(id, enabled) {
    const { error } = await sb
      .from('reminders')
      .update({ enabled: !enabled })
      .eq('id', id);
    if (error) throw error;
  }

  async function deleteReminder(id) {
    const patch = { enabled: false, deleted_at: new Date().toISOString() };
    const { error } = await sb
      .from('reminders')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async function saveReminder() {
    if (!state.user || !state.reminderMedicineId) return;

    const times = collectReminderTimes();
    const doseText = String(ui.remDoseText?.value || '').trim();
    const repeatRule = String(ui.remRepeatType?.value || 'daily').trim() || 'daily';
    const notifyEmail = String(ui.remEmail?.value || state.user.email || '').trim();

    if (!times.length) {
      setHint(ui.remStatus, 'Cần ít nhất một giờ nhắc.', false);
      return;
    }
    if (!notifyEmail) {
      setHint(ui.remStatus, 'Cần email để nhận nhắc.', false);
      return;
    }

    setHint(ui.remStatus, 'Đang lưu nhắc...', true);

    const currentRows = state.reminders.filter((x) => x.user_medicine_id === state.reminderMedicineId && !x.deleted_at);
    if (currentRows.length) {
      const { error: softErr } = await sb
        .from('reminders')
        .update({ enabled: false, deleted_at: new Date().toISOString() })
        .in('id', currentRows.map((x) => x.id));
      if (softErr) {
        console.error(softErr);
        setHint(ui.remStatus, `Không cập nhật được reminder cũ: ${softErr.message}`, false);
        return;
      }
    }

    const rows = times.map((time) => ({
      user_id: state.user.id,
      user_medicine_id: state.reminderMedicineId,
      remind_time: time,
      repeat_rule: repeatRule,
      enabled: true,
      dose_text: doseText || null,
      notify_email: notifyEmail,
      channel: 'email'
    }));

    const { error } = await sb.from('reminders').insert(rows);
    if (error) {
      console.error(error);
      setHint(ui.remStatus, `Lưu nhắc thất bại: ${error.message}`, false);
      return;
    }

    await loadReminders();
    renderMedicineReminders(state.reminderMedicineId);
    setHint(ui.remStatus, 'Đã lưu nhắc thuốc.', true);
  }

  function bindFilters() {
    document.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter || 'all';
        renderInventory();
      });
    });

    ui.searchInput?.addEventListener('input', () => {
      state.search = ui.searchInput.value || '';
      renderInventory();
    });

    ui.qtySlider?.addEventListener('input', () => {
      if (ui.qtyVal) ui.qtyVal.textContent = ui.qtySlider.value;
      renderInventory();
    });
  }

  function bindTableActions() {
    ui.tableBody?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;

      const id = btn.dataset.id;
      const item = state.inventory.find((x) => x.id === id);
      if (!item) return;

      if (btn.dataset.action === 'detail') {
        fillDetailModal(item);
        openModal(ui.detailModal);
        return;
      }

      if (btn.dataset.action === 'edit') {
        fillEditModal(item);
        openModal(ui.editModal);
        return;
      }

      if (btn.dataset.action === 'reminder') {
        fillReminderModal(item);
        renderMedicineReminders(item.id);
        openModal(ui.reminderModal);
        return;
      }

      if (btn.dataset.action === 'delete') {
        const ok = window.confirm(`Chuyển "${item.medicine_name}" vào thùng rác?`);
        if (!ok) return;
        try {
          await softDelete([id]);
          await Promise.all([loadInventory(), loadTrash(), loadReminders()]);
        } catch (error) {
          console.error(error);
          alert(`Xóa thất bại: ${error.message}`);
        }
      }
    });
  }

  function bindTrashActions() {
    ui.btnOpenTrash?.addEventListener('click', async () => {
      try {
        await loadTrash();
        openModal(ui.trashModal);
      } catch (error) {
        console.error(error);
        alert(`Không mở được thùng rác: ${error.message}`);
      }
    });

    ui.btnCloseTrash?.addEventListener('click', () => closeModal(ui.trashModal));

    ui.btnEmptyTrash?.addEventListener('click', async () => {
      if (!state.trash.length) return;
      const ok = window.confirm('Xóa vĩnh viễn toàn bộ thuốc trong thùng rác?');
      if (!ok) return;
      try {
        await hardDelete(state.trash.map((x) => x.id));
        await loadTrash();
      } catch (error) {
        console.error(error);
        alert(`Xóa vĩnh viễn thất bại: ${error.message}`);
      }
    });

    ui.trashBody?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-trash-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      try {
        if (btn.dataset.trashAction === 'restore') {
          await restoreOne(id);
        } else if (btn.dataset.trashAction === 'delete-forever') {
          const ok = window.confirm('Xóa vĩnh viễn bản ghi này?');
          if (!ok) return;
          await hardDelete([id]);
        }
        await Promise.all([loadTrash(), loadInventory(), loadReminders()]);
      } catch (error) {
        console.error(error);
        alert(`Thao tác thất bại: ${error.message}`);
      }
    });
  }

  function bindBulkDelete() {
    ui.btnBulkDelete?.addEventListener('click', async () => {
      const rows = getFilteredInventory();
      if (!rows.length) {
        alert('Không có thuốc nào trong bộ lọc hiện tại.');
        return;
      }
      const ok = window.confirm(`Chuyển ${rows.length} thuốc đang lọc vào thùng rác?`);
      if (!ok) return;
      try {
        await softDelete(rows.map((x) => x.id));
        await Promise.all([loadInventory(), loadTrash(), loadReminders()]);
      } catch (error) {
        console.error(error);
        alert(`Xóa hàng loạt thất bại: ${error.message}`);
      }
    });
  }

  function bindEditModal() {
    ui.btnCloseEdit?.addEventListener('click', () => closeModal(ui.editModal));
    ui.btnSaveEdit?.addEventListener('click', saveEdit);
  }

  function bindDetailModal() {
    ui.btnCloseDetail?.addEventListener('click', () => closeModal(ui.detailModal));
  }

  function bindReminderModal() {
    ui.btnCloseReminder?.addEventListener('click', () => closeModal(ui.reminderModal));
    ui.btnAddRemTime?.addEventListener('click', () => {
      ui.remTimesContainer?.appendChild(createTimeRow(''));
    });
    ui.btnSaveReminder?.addEventListener('click', saveReminder);
    ui.btnReloadGlobalReminders?.addEventListener('click', async () => {
      try {
        await loadReminders();
      } catch (error) {
        console.error(error);
      }
    });

    ui.remExistingList?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-rem-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const row = state.reminders.find((x) => x.id === id);
      if (!row) return;
      try {
        if (btn.dataset.remAction === 'toggle') {
          await toggleReminder(id, row.enabled);
        } else if (btn.dataset.remAction === 'delete') {
          await deleteReminder(id);
        }
        await loadReminders();
      } catch (error) {
        console.error(error);
        setHint(ui.remStatus, error.message || 'Thao tác reminder thất bại.', false);
      }
    });
  }

  function bindModalBackdropClose() {
    [ui.detailModal, ui.editModal, ui.reminderModal, ui.trashModal].forEach((modal) => {
      modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      [ui.detailModal, ui.editModal, ui.reminderModal, ui.trashModal].forEach((modal) => {
        if (modal && !modal.classList.contains('hidden')) closeModal(modal);
      });
    });
  }

  async function bootstrap() {
    if (!sb) {
      console.error('Supabase client chưa sẵn sàng. Hãy load auth-state.js trước kho.js');
      if (ui.tableBody) {
        ui.tableBody.innerHTML = `
          <tr><td colspan="7" class="px-4 py-8 text-center text-rose-600">
            Thiếu Supabase client. Hãy load auth-state.js trước kho.js.
          </td></tr>`;
      }
      return;
    }

    const user = await fetchSessionUser();
    if (!user) {
      if (ui.tableBody) {
        ui.tableBody.innerHTML = `
          <tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">
            Hãy đăng nhập để xem kho thuốc của bạn.
          </td></tr>`;
      }
      setMessage(ui.addMsg, 'Bạn cần đăng nhập trước khi thêm thuốc.', false);
      return;
    }

    await Promise.all([fetchCabinet(), loadCatalog(), loadTrash(), loadReminders()]);
    await loadInventory();
  }

  function bindStatic() {
    bindFilters();
    bindTableActions();
    bindTrashActions();
    bindBulkDelete();
    bindEditModal();
    bindDetailModal();
    bindReminderModal();
    bindModalBackdropClose();

    ui.formAddDrug?.addEventListener('submit', addMedicine);
    ui.btnClearAdd?.addEventListener('click', clearAddForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindStatic();
    bootstrap().catch((error) => {
      console.error('kho.js bootstrap error', error);
      if (ui.tableBody) {
        ui.tableBody.innerHTML = `
          <tr><td colspan="7" class="px-4 py-8 text-center text-rose-600">
            Không tải được dữ liệu kho: ${esc(error.message || error)}
          </td></tr>`;
      }
    });
  });
})();
