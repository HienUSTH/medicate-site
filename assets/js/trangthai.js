(function () {
  const SUPABASE_URL = 'https://kbdqkvcmfkuthlbbnaac.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZHFrdmNtZmt1dGhsYmJuYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTczNzIsImV4cCI6MjA5MDA3MzM3Mn0.8dDVYCZyvTYRR7pkeleTiW1vv9ktNiPD8dml0DU4HDw';

  const REFRESH_MS = 15000;

  let sb = null;
  let refreshTimer = null;

  const state = {
    user: null,
    latest: null,
    nowRows: [],
    historyRows: [],
    historyDate: null,
    statusEmailAlertsEnabled: true,
    profileEmail: ''
  };

  function getClient() {
    if (!window.supabase) {
      throw new Error('Supabase chưa sẵn sàng.');
    }
    if (!sb) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return sb;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(1);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  }

  function formatDateOnly(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '—';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setError(message) {
    const box = document.getElementById('statusError');
    if (!box) return;
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function clearError() {
    const box = document.getElementById('statusError');
    if (!box) return;
    box.textContent = '';
    box.classList.add('hidden');
  }

  function buildPastDateOptions(days = 14) {
    const out = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);

    for (let i = 1; i <= days; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      out.push({
        value: `${y}-${m}-${day}`,
        label: `${day}/${m}/${y}`
      });
    }
    return out;
  }

  function buildUtcRangeForLocalDate(ymd) {
    const start = new Date(`${ymd}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString()
    };
  }

  function withTempEmoji(row) {
    const label = row?.temp_band_label || '—';
    const key = row?.temp_band_key || '';
    if (key === 'low') return `❄️ ${label}`;
    if (key === 'stable') return `✅ ${label}`;
    if (key === 'warning') return `⚠️ ${label}`;
    if (key === 'danger') return `🔥 ${label}`;
    return label;
  }

  function withHumEmoji(row) {
    const label = row?.humidity_band_label || '—';
    const key = row?.humidity_band_key || '';
    if (key === 'dry') return `⚠️ ${label}`;
    if (key === 'stable') return `✅ ${label}`;
    if (key === 'warning') return `⚠️ ${label}`;
    if (key === 'danger') return `💧 ${label}`;
    return label;
  }

  function setOverallBadge(level, text) {
    const el = document.getElementById('nowOverallBadge');
    if (!el) return;

    el.className = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';

    if (level === 'danger') {
      el.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
      el.textContent = text || '🚨 Cảnh báo';
      return;
    }
    if (level === 'warning') {
      el.classList.add('border-amber-200', 'bg-amber-50', 'text-amber-700');
      el.textContent = text || '⚠️ Cần chú ý';
      return;
    }
    if (level === 'safe') {
      el.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
      el.textContent = text || '✅ An toàn';
      return;
    }
    if (level === 'offline') {
      el.classList.add('border-slate-200', 'bg-slate-100', 'text-slate-700');
      el.textContent = text || '📴 Dữ liệu cũ';
      return;
    }

    el.classList.add('border-slate-200', 'bg-slate-50', 'text-slate-600');
    el.textContent = text || '❔ Chưa có dữ liệu';
  }

  function renderEmailAlertToggle() {
    const btn = document.getElementById('emailAlertToggle');
    const hint = document.getElementById('emailAlertHint');
    if (!btn) return;

    if (!state.user) {
      btn.disabled = true;
      btn.className = 'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium border-slate-200 bg-slate-100 text-slate-500';
      btn.textContent = 'Mail cảnh báo: cần đăng nhập';
      if (hint) hint.textContent = 'Đăng nhập để bật hoặc tắt mail cảnh báo.';
      return;
    }

    btn.disabled = false;

    if (state.statusEmailAlertsEnabled) {
      btn.className = 'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium border-emerald-200 bg-emerald-50 text-emerald-700';
      btn.textContent = 'Mail cảnh báo: đang bật';
    } else {
      btn.className = 'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium border-slate-200 bg-slate-100 text-slate-700';
      btn.textContent = 'Mail cảnh báo: đang tắt';
    }

    if (hint) {
      hint.textContent = state.profileEmail
        ? `Mail sẽ gửi tới: ${state.profileEmail}`
        : 'Tài khoản này chưa có email profile.';
    }
  }

  async function loadProfileAlertSetting() {
    const client = getClient();
    if (!state.user) {
      state.statusEmailAlertsEnabled = true;
      state.profileEmail = '';
      renderEmailAlertToggle();
      return;
    }

    const { data, error } = await client
      .from('profiles')
      .select('email, status_email_alerts_enabled')
      .eq('id', state.user.id)
      .single();

    if (error) throw error;

    state.profileEmail = data?.email || state.user.email || '';
    state.statusEmailAlertsEnabled = data?.status_email_alerts_enabled !== false;
    renderEmailAlertToggle();
  }

  async function saveProfileAlertSetting(nextValue) {
    const client = getClient();
    if (!state.user) return;

    const { error } = await client
      .from('profiles')
      .update({ status_email_alerts_enabled: nextValue })
      .eq('id', state.user.id);

    if (error) throw error;

    state.statusEmailAlertsEnabled = nextValue;
    renderEmailAlertToggle();
  }

  function renderLatestStatus() {
    const row = state.latest;

    const cabinetNameEl = document.getElementById('nowCabinetName');
    const timestampEl = document.getElementById('nowTimestamp');
    const tempEl = document.getElementById('nowTemp');
    const humEl = document.getElementById('nowHum');
    const tempBandEl = document.getElementById('nowTempBand');
    const humBandEl = document.getElementById('nowHumBand');
    const noteEl = document.getElementById('nowFreshnessNote');

    if (!row) {
      if (cabinetNameEl) cabinetNameEl.textContent = '—';
      if (timestampEl) timestampEl.textContent = '—';
      if (tempEl) tempEl.textContent = '—';
      if (humEl) humEl.textContent = '—';
      if (tempBandEl) tempBandEl.textContent = '—';
      if (humBandEl) humBandEl.textContent = '—';
      if (noteEl) noteEl.textContent = 'Chưa có dữ liệu cảm biến.';
      setOverallBadge('unknown', '❔ Chưa có dữ liệu');
      return;
    }

    if (cabinetNameEl) cabinetNameEl.textContent = row.cabinet_name || 'Tủ thuốc';
    if (timestampEl) timestampEl.textContent = formatDateTime(row.recorded_at);
    if (tempEl) tempEl.textContent = `${formatNumber(row.temperature)} °C`;
    if (humEl) humEl.textContent = `${formatNumber(row.humidity)} %`;
    if (tempBandEl) tempBandEl.textContent = withTempEmoji(row);
    if (humBandEl) humBandEl.textContent = withHumEmoji(row);

    if (row.device_online === false) {
      setOverallBadge('offline', '📴 Pi offline');
      if (noteEl) noteEl.textContent = 'Pi đang offline, trang web đang giữ lại mẫu đo gần nhất.';
      return;
    }

    if (!row.recent_24h) {
      setOverallBadge('offline', '📴 Dữ liệu cũ');
      if (noteEl) noteEl.textContent = 'Chưa có mẫu mới trong 24 giờ gần nhất. Đây là dữ liệu cuối cùng còn lưu.';
      return;
    }

    if (row.alert_level_key === 'danger') {
      setOverallBadge('danger', '🚨 Cảnh báo');
    } else if (row.alert_level_key === 'warning') {
      setOverallBadge('warning', '⚠️ Cần chú ý');
    } else if (row.alert_level_key === 'safe') {
      setOverallBadge('safe', '✅ An toàn');
    } else {
      setOverallBadge('unknown', row.alert_level_label || '❔ Chưa rõ');
    }

    if (noteEl) noteEl.textContent = 'Dữ liệu đang tự động cập nhật từ Pi qua Supabase.';
  }

  function renderTable(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">Không có dữ liệu.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row, index) => {
      const rowCls = index % 2 ? 'bg-slate-50/50' : 'bg-white';
      return `
        <tr class="${rowCls}">
          <td class="px-4 py-1.5 whitespace-nowrap text-xs md:text-sm">${escapeHtml(formatDateTime(row.recorded_at))}</td>
          <td class="px-4 py-1.5 text-right">${escapeHtml(formatNumber(row.temperature))}</td>
          <td class="px-4 py-1.5 text-xs">${escapeHtml(withTempEmoji(row))}</td>
          <td class="px-4 py-1.5 text-right">${escapeHtml(formatNumber(row.humidity))}</td>
          <td class="px-4 py-1.5 text-xs">${escapeHtml(withHumEmoji(row))}</td>
        </tr>
      `;
    }).join('');
  }

  function matchTempBand(row, mode) {
    if (!mode) return true;
    const key = row.temp_band_key || '';
    if (mode === 'cold') return key === 'low';
    if (mode === 'ok') return key === 'stable';
    if (mode === 'warn') return key === 'warning';
    if (mode === 'hot') return key === 'danger';
    return true;
  }

  function matchHumBand(row, mode) {
    if (!mode) return true;
    const key = row.humidity_band_key || '';
    if (mode === 'dry') return key === 'dry';
    if (mode === 'ok') return key === 'stable';
    if (mode === 'warn') return key === 'warning';
    if (mode === 'wet') return key === 'danger';
    return true;
  }

  function applyNowFilters() {
    const tempMode = document.getElementById('nowTempBandSelect')?.value || '';
    const humMode = document.getElementById('nowHumBandSelect')?.value || '';
    const query = (document.getElementById('nowSearch')?.value || '').trim().toLowerCase();

    let rows = state.nowRows.slice();
    rows = rows.filter((row) => matchTempBand(row, tempMode) && matchHumBand(row, humMode));

    if (query) {
      rows = rows.filter((row) => {
        const time = formatDateTime(row.recorded_at).toLowerCase();
        const temp = formatNumber(row.temperature);
        const hum = formatNumber(row.humidity);
        return time.includes(query) || temp.includes(query) || hum.includes(query);
      });
    }

    const shown = rows.slice(0, 20);
    renderTable('nowTableBody', shown);

    const summary = document.getElementById('nowSummary');
    if (summary) {
      summary.textContent = shown.length
        ? `${shown.length} mẫu đang hiển thị trong 24 giờ gần nhất.`
        : 'Không có mẫu nào khớp điều kiện lọc.';
    }
  }

  function applyHistoryFilters() {
    const tempMode = document.getElementById('historyTempBandSelect')?.value || '';
    const humMode = document.getElementById('historyHumBandSelect')?.value || '';
    const query = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();

    let rows = state.historyRows.slice();
    rows = rows.filter((row) => matchTempBand(row, tempMode) && matchHumBand(row, humMode));

    if (query) {
      rows = rows.filter((row) => {
        const time = formatDateTime(row.recorded_at).toLowerCase();
        const temp = formatNumber(row.temperature);
        const hum = formatNumber(row.humidity);
        return time.includes(query) || temp.includes(query) || hum.includes(query);
      });
    }

    renderTable('historyTableBody', rows);

    const summary = document.getElementById('historySummary');
    if (summary) {
      const label = state.historyDate === 'all'
        ? 'tất cả lịch sử đang tải'
        : `ngày ${formatDateOnly(state.historyDate)}`;
      summary.textContent = rows.length
        ? `${rows.length} mẫu khớp bộ lọc cho ${label}.`
        : `Không có mẫu nào khớp bộ lọc cho ${label}.`;
    }
  }

  function wireNowControls() {
    const rerender = () => applyNowFilters();
    document.getElementById('nowTempBandSelect')?.addEventListener('change', rerender);
    document.getElementById('nowHumBandSelect')?.addEventListener('change', rerender);

    let nowTimer = null;
    document.getElementById('nowSearch')?.addEventListener('input', () => {
      clearTimeout(nowTimer);
      nowTimer = setTimeout(rerender, 180);
    });
  }

  function fillHistoryDateOptions() {
    const select = document.getElementById('historyDateSelect');
    if (!select) return;

    const options = buildPastDateOptions(14);

    select.innerHTML = `
      <option value="all">Tất cả lịch sử (tối đa 1000 mẫu gần nhất)</option>
      ${options.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}
    `;

    if (!state.historyDate) {
      state.historyDate = options[0]?.value || 'all';
    }
    select.value = state.historyDate;
  }

  async function loadLatestStatus() {
    const client = getClient();
    const { data, error } = await client
      .from('v_sensor_latest_status')
      .select('*')
      .eq('user_id', state.user.id)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    state.latest = data?.[0] || null;
  }

  async function loadNowRows() {
    const client = getClient();
    const { data, error } = await client
      .from('v_sensor_current_24h')
      .select('*')
      .eq('user_id', state.user.id)
      .order('recorded_at', { ascending: false })
      .range(0, 199);

    if (error) throw error;
    state.nowRows = data || [];
  }

  async function loadHistoryRows(dateValue) {
    const client = getClient();
    let query = client
      .from('v_sensor_history_14d')
      .select('*')
      .eq('user_id', state.user.id)
      .order('recorded_at', { ascending: false });

    if (dateValue && dateValue !== 'all') {
      const { startIso, endIso } = buildUtcRangeForLocalDate(dateValue);
      query = query.gte('recorded_at', startIso).lt('recorded_at', endIso).range(0, 999);
    } else {
      query = query.range(0, 999);
    }

    const { data, error } = await query;
    if (error) throw error;
    state.historyRows = data || [];
  }

  function switchView(view) {
    const nowSec = document.getElementById('statusNow');
    const hisSec = document.getElementById('statusHistory');
    const tabNow = document.querySelector('[data-view-tab="now"]');
    const tabHis = document.querySelector('[data-view-tab="history"]');

    if (!nowSec || !hisSec || !tabNow || !tabHis) return;

    const activeCls = ['bg-white', 'shadow-sm', 'border-slate-200', 'text-sky-700'];
    const inactiveCls = ['bg-transparent', 'border-transparent', 'text-slate-600'];

    if (view === 'history') {
      nowSec.classList.add('hidden');
      hisSec.classList.remove('hidden');
      tabNow.classList.remove(...activeCls);
      tabNow.classList.add(...inactiveCls);
      tabHis.classList.remove(...inactiveCls);
      tabHis.classList.add(...activeCls);
      return;
    }

    hisSec.classList.add('hidden');
    nowSec.classList.remove('hidden');
    tabHis.classList.remove(...activeCls);
    tabHis.classList.add(...inactiveCls);
    tabNow.classList.remove(...inactiveCls);
    tabNow.classList.add(...activeCls);
  }

  async function refreshPageData(includeHistory = true) {
    state.user = (await getClient().auth.getUser()).data?.user || null;

    if (!state.user) {
      setError('Hãy đăng nhập để xem trạng thái tủ thuốc của bạn.');
      state.latest = null;
      state.nowRows = [];
      state.historyRows = [];
      state.profileEmail = '';
      state.statusEmailAlertsEnabled = true;
      renderLatestStatus();
      renderTable('nowTableBody', []);
      renderTable('historyTableBody', []);
      renderEmailAlertToggle();
      return;
    }

    clearError();

    await loadProfileAlertSetting();
    await loadLatestStatus();
    await loadNowRows();
    if (includeHistory) {
      await loadHistoryRows(state.historyDate || 'all');
    }

    renderLatestStatus();
    renderEmailAlertToggle();
    applyNowFilters();
    applyHistoryFilters();
  }

  function wireHistoryControls() {
    const historyDateSelect = document.getElementById('historyDateSelect');
    const historyTempBandSelect = document.getElementById('historyTempBandSelect');
    const historyHumBandSelect = document.getElementById('historyHumBandSelect');
    const historySearch = document.getElementById('historySearch');

    historyDateSelect?.addEventListener('change', async (e) => {
      state.historyDate = e.target.value || 'all';
      try {
        await loadHistoryRows(state.historyDate);
        applyHistoryFilters();
      } catch (err) {
        console.error(err);
        setError('Không tải được lịch sử trạng thái.');
      }
    });

    const rerender = () => applyHistoryFilters();
    historyTempBandSelect?.addEventListener('change', rerender);
    historyHumBandSelect?.addEventListener('change', rerender);

    let historyTimer = null;
    historySearch?.addEventListener('input', () => {
      clearTimeout(historyTimer);
      historyTimer = setTimeout(rerender, 180);
    });
  }

  function wireTabs() {
    document.querySelectorAll('[data-view-tab]').forEach((link) => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        const view = link.dataset.viewTab || 'now';
        const url = new URL(window.location.href);
        url.searchParams.set('view', view);
        history.replaceState({}, '', url.toString());
        switchView(view);

        if (view === 'history') {
          try {
            await loadHistoryRows(state.historyDate || 'all');
            applyHistoryFilters();
          } catch (err) {
            console.error(err);
            setError('Không tải được lịch sử trạng thái.');
          }
        }
      });
    });
  }

  function wireEmailToggle() {
    document.getElementById('emailAlertToggle')?.addEventListener('click', async () => {
      if (!state.user) return;
      const nextValue = !state.statusEmailAlertsEnabled;
      const btn = document.getElementById('emailAlertToggle');
      if (btn) btn.disabled = true;

      try {
        await saveProfileAlertSetting(nextValue);
      } catch (err) {
        console.error(err);
        setError('Không cập nhật được cài đặt mail cảnh báo.');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  async function init() {
    fillHistoryDateOptions();
    wireNowControls();
    wireHistoryControls();
    wireTabs();
    wireEmailToggle();

    const view = new URLSearchParams(window.location.search).get('view') || 'now';
    switchView(view);

    try {
      await refreshPageData(true);
    } catch (err) {
      console.error(err);
      setError('Không tải được dữ liệu trạng thái từ Supabase.');
    }

    const client = getClient();
    client.auth.onAuthStateChange(async () => {
      try {
        await refreshPageData(true);
      } catch (err) {
        console.error(err);
      }
    });

    refreshTimer = setInterval(async () => {
      try {
        const historyVisible = !document.getElementById('statusHistory')?.classList.contains('hidden');
        await refreshPageData(historyVisible);
      } catch (err) {
        console.error('Auto refresh trạng thái lỗi:', err);
      }
    }, REFRESH_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
