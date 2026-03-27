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
    filter: 'all',
    search: '',
    qtyMax: 10,
    showMissingOnly: false,
    editingId: null
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
    btnToggleMissing: $('btnToggleMissing'),
    coverageBadge: $('coverageBadge'),
    catalogList: $('catalogList'),
    editModal: $('editModal'),
    btnCloseEdit: $('btnCloseEdit'),
    editDrugName: $('editDrugName'),
    editBarcode: $('editBarcode') || $('editAlias'),
    editSL: $('editSL'),
    editHSD: $('editHSD'),
    editNgayNhap: $('editNgayNhap'),
    editStatus: $('editStatus'),
    btnSaveEdit: $('btnSaveEdit'),
    trashModal: $('trashModal'),
    btnOpenTrash: $('btnOpenTrash'),
    btnCloseTrash: $('btnCloseTrash'),
    btnEmptyTrash: $('btnEmptyTrash'),
    trashBody: $('trashBody')
  };

  function setMessage(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.id === 'addMsg' ? 'text-xs ml-auto ' : 'text-xs mt-1 ') +
      (ok ? 'text-emerald-700' : 'text-rose-600');
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

  function statusToFilter(status) {
    if (status === 'Còn hạn') return 'ok';
    if (status === 'Sắp hết hạn') return 'soon';
    if (status === 'Hết hạn') return 'expired';
    return 'all';
  }

  function updateQtySliderMax() {
    const maxQty = Math.max(10, ...state.inventory.map((x) => Number(x.quantity) || 0));
    state.qtyMax = maxQty;
    if (ui.qtySlider) {
      ui.qtySlider.max = String(maxQty);
      if (Number(ui.qtySlider.value) > maxQty || !ui.qtySlider.value) {
        ui.qtySlider.value = String(maxQty);
      }
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
        item.source
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
      const sourceLabel = item.source ? `• ${esc(item.source)}` : '';
      const barcode = item.barcode ? esc(item.barcode) : '—';
      const noteLine = item.note ? `<div class="text-[11px] text-slate-500 mt-1">${esc(item.note)}</div>` : '';
      return `
        <tr>
          <td class="px-3 py-3 align-top">
            <div class="font-semibold text-slate-800 break-words">${esc(item.medicine_name)}</div>
            <div class="text-[11px] text-slate-500 mt-1">${sourceLabel}</div>
            ${noteLine}
            <div class="flex flex-wrap gap-1 mt-2">
              <button data-action="edit" data-id="${item.id}" class="px-2 py-1 rounded-full border border-slate-300 text-xs hover:bg-slate-50">Sửa</button>
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

  function renderCatalog() {
    if (!ui.catalogList || !ui.coverageBadge) return;

    const invNames = new Set(state.inventory.map((x) => norm(x.medicine_name)));
    const matched = state.catalog.filter((x) => invNames.has(norm(x.name)));
    const missing = state.catalog.filter((x) => !invNames.has(norm(x.name)));
    ui.coverageBadge.textContent = `Khớp catalog: ${matched.length}/${state.catalog.length}`;

    const list = state.showMissingOnly ? missing : state.catalog;
    ui.btnToggleMissing && (ui.btnToggleMissing.textContent = state.showMissingOnly ? 'Xem tất cả danh mục' : 'Xem mục thiếu');

    if (!list.length) {
      ui.catalogList.innerHTML = `<div class="text-slate-500 text-sm">Chưa có dữ liệu danh mục.</div>`;
      return;
    }

    ui.catalogList.innerHTML = list.slice(0, 120).map((item) => {
      const isOwned = invNames.has(norm(item.name));
      return `
        <button type="button" data-catalog-name="${esc(item.name)}"
          class="w-full text-left px-3 py-2 rounded-lg border ${isOwned ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}">
          <div class="font-medium text-sm">${esc(item.name)}</div>
          <div class="text-[11px] text-slate-500">${isOwned ? 'Đã có trong kho' : 'Chưa có trong kho'}</div>
        </button>
      `;
    }).join('');
  }

  function openModal(el) {
    el?.classList.remove('hidden');
  }

  function closeModal(el) {
    el?.classList.add('hidden');
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
      .from('v_inventory')
      .select('*')
      .order('imported_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    state.inventory = data || [];
    updateQtySliderMax();
    renderInventory();
    renderCatalog();
  }

  async function loadCatalog() {
    const { data, error } = await sb
      .from('medicine_catalog')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    state.catalog = data || [];
    renderCatalog();
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
            <button data-trash-action="restore" data-id="${item.id}" class="px-2 py-1 rounded border border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50">
              Khôi phục
            </button>
            <button data-trash-action="delete-forever" data-id="${item.id}" class="px-2 py-1 rounded border border-rose-300 text-rose-700 text-xs hover:bg-rose-50">
              Xóa hẳn
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function fillEditModal(item) {
    state.editingId = item.id;
    if (ui.editDrugName) ui.editDrugName.value = item.medicine_name || '';
    if (ui.editBarcode) ui.editBarcode.value = item.barcode || '';
    if (ui.editSL) ui.editSL.value = Number(item.quantity) || 0;
    if (ui.editHSD) ui.editHSD.value = formatDate(item.expiry_date) === '—' ? '' : formatDate(item.expiry_date);
    if (ui.editNgayNhap) ui.editNgayNhap.value = formatDate(item.imported_at) === '—' ? '' : formatDate(item.imported_at);
    if (ui.editStatus) ui.editStatus.textContent = `Trạng thái hiện tại: ${item.status || 'Chưa rõ'} • Còn ngày: ${formatDays(item.days_remaining)}`;
  }

  function clearAddForm() {
    ui.formAddDrug?.reset();
    if (ui.addSL) ui.addSL.value = '';
    if (ui.addNgayNhap) ui.addNgayNhap.value = '';
    setMessage(ui.addMsg, '');
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

    setMessage(ui.addMsg, 'Đang lưu...');

    const payload = {
      user_id: state.user.id,
      cabinet_id: state.cabinetId,
      catalog_id: resolveCatalogIdByName(name),
      custom_name: name,
      barcode: barcode || null,
      quantity,
      expiry_date: expiryDate,
      imported_at: importedAt,
      source: barcode ? 'barcode' : 'manual'
    };

    const { error } = await sb.from('user_medicines').insert(payload);
    if (error) {
      console.error(error);
      setMessage(ui.addMsg, `Lưu thất bại: ${error.message}`, false);
      return;
    }

    clearAddForm();
    setMessage(ui.addMsg, 'Đã thêm thuốc vào Supabase.');
    await loadInventory();
  }

  async function saveEdit() {
    if (!state.editingId) return;
    const quantity = Number(ui.editSL?.value || 0);
    const expiryDate = parseDateInput(ui.editHSD?.value);
    const importedAt = parseDateInput(ui.editNgayNhap?.value);
    const barcode = String(ui.editBarcode?.value || '').trim();

    if (!Number.isFinite(quantity) || quantity < 0) {
      if (ui.editStatus) ui.editStatus.textContent = 'Số lượng phải là số không âm.';
      return;
    }

    if (ui.editHSD?.value && !expiryDate) {
      if (ui.editStatus) ui.editStatus.textContent = 'HSD chưa đúng định dạng.';
      return;
    }

    if (!importedAt) {
      if (ui.editStatus) ui.editStatus.textContent = 'Ngày nhập là bắt buộc và phải đúng định dạng.';
      return;
    }

    if (ui.editStatus) ui.editStatus.textContent = 'Đang lưu thay đổi...';

    const { error } = await sb
      .from('user_medicines')
      .update({
        barcode: barcode || null,
        quantity,
        expiry_date: expiryDate,
        imported_at: importedAt
      })
      .eq('id', state.editingId);

    if (error) {
      console.error(error);
      if (ui.editStatus) ui.editStatus.textContent = `Lưu thất bại: ${error.message}`;
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

  function bindCatalogActions() {
    ui.btnToggleMissing?.addEventListener('click', () => {
      state.showMissingOnly = !state.showMissingOnly;
      renderCatalog();
    });

    ui.catalogList?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-catalog-name]');
      if (!btn) return;
      const name = btn.getAttribute('data-catalog-name') || '';
      if (ui.addTen && !ui.addTen.value) ui.addTen.value = name;
      ui.addTen?.focus();
    });
  }

  function bindTableActions() {
    ui.tableBody?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;

      const id = btn.dataset.id;
      const item = state.inventory.find((x) => x.id === id);
      if (!item) return;

      if (btn.dataset.action === 'edit') {
        fillEditModal(item);
        openModal(ui.editModal);
        return;
      }

      if (btn.dataset.action === 'delete') {
        const ok = window.confirm(`Chuyển "${item.medicine_name}" vào thùng rác?`);
        if (!ok) return;

        try {
          await softDelete([id]);
          await Promise.all([loadInventory(), loadTrash()]);
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
        await Promise.all([loadTrash(), loadInventory()]);
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
        await Promise.all([loadInventory(), loadTrash()]);
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

    await Promise.all([fetchCabinet(), loadCatalog(), loadTrash()]);
    await loadInventory();
  }

  function bindStatic() {
    bindFilters();
    bindCatalogActions();
    bindTableActions();
    bindTrashActions();
    bindBulkDelete();
    bindEditModal();

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
