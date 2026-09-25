/* =====================================================================
 * FinTrack — app.js
 * Script utama: State, localStorage, semua logika halaman,
 * integrasi Chart.js, dan event listeners.
 * Setiap modul hanya dijalankan jika elemen halaman terkait ada di DOM.
 * ===================================================================== */

'use strict';

/* =====================================================================
 * CONSTANTS & STORAGE KEYS
 * ===================================================================== */

const STORAGE_KEY      = 'fintrack_data_v1';
const STORAGE_KEY_DEBT = 'fintrack_debts_v1';

/* =====================================================================
 * TYPEDEF (dokumentasi saja, bukan runtime)
 * @typedef {{ need: number, wants: number, savings: number }} Wallets
 * @typedef {{ id: string, date: string, description: string, category: string, type: 'income'|'expense', amount: number, splitDetail?: object }} Transaction
 * @typedef {{ id: string, type: 'piutang'|'hutang', party: string, amount: number, dateFrom: string, dateDue: string, note: string, settled: boolean }} DebtRecord
 * ===================================================================== */

const DEFAULT_STATE = {
  wallets: { need: 0, wants: 0, savings: 0 },
  transactions: [],
};

/* =====================================================================
 * PERSISTENCE HELPERS
 * ===================================================================== */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadDebts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEBT);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDebts(debts) {
  localStorage.setItem(STORAGE_KEY_DEBT, JSON.stringify(debts));
}

/* =====================================================================
 * UTILITY HELPERS
 * ===================================================================== */

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Format ISO date string (YYYY-MM-DD) → "15 Jan 2026"
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(Number(y), Number(m) - 1, Number(d)));
}

/**
 * Ambil key "YYYY-MM" dari ISO date string.
 * @param {string} isoDate
 * @returns {string}
 */
function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : '';
}

/**
 * Format "YYYY-MM" → "Jan 2026"
 * @param {string} key
 * @returns {string}
 */
function formatMonthLabel(key) {
  const [y, m] = key.split('-');
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' })
    .format(new Date(Number(y), Number(m) - 1, 1));
}

function walletLabel(key) {
  return { need: 'Need', wants: 'Wants', savings: 'Tabungan' }[key] ?? key;
}

/* =====================================================================
 * TOAST NOTIFICATION
 * ===================================================================== */

function showToast(message, type = 'neutral', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const colorMap = {
    success: 'background:#059669;color:#fff',
    error:   'background:#ef4444;color:#fff',
    warning: 'background:#f97316;color:#fff',
    neutral: 'background:#334155;color:#fff',
  };

  const toast = document.createElement('div');
  toast.className = 'toast-enter';
  toast.style.cssText = `
    ${colorMap[type] || colorMap.neutral};
    pointer-events:auto;
    font-size:0.8125rem;
    font-weight:500;
    padding:0.6rem 1rem;
    border-radius:0.75rem;
    box-shadow:0 4px 12px rgb(0 0 0/0.15);
    max-width:22rem;
    text-align:center;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* =====================================================================
 * CATEGORY BADGE HELPER
 * ===================================================================== */

function renderCategoryBadge(category) {
  const map = {
    need:    '<span style="font-size:.6875rem;font-weight:600;background:#e0f2fe;color:#0369a1;padding:.2rem .55rem;border-radius:9999px">Need</span>',
    wants:   '<span style="font-size:.6875rem;font-weight:600;background:#fff7ed;color:#c2410c;padding:.2rem .55rem;border-radius:9999px">Wants</span>',
    savings: '<span style="font-size:.6875rem;font-weight:600;background:#d1fae5;color:#065f46;padding:.2rem .55rem;border-radius:9999px">Tabungan</span>',
    split:   '<span style="font-size:.6875rem;font-weight:600;background:#ede9fe;color:#6d28d9;padding:.2rem .55rem;border-radius:9999px">Split</span>',
  };
  return map[category] ?? `<span style="font-size:.6875rem;color:#64748b">${escapeHtml(category)}</span>`;
}

/* =====================================================================
 * ================================================================
 * MODULE 1 — INDEX.HTML  (3-Bucket Budgeting)
 * ================================================================
 * ===================================================================== */

function initIndexPage() {
  if (!document.getElementById('incomeForm')) return;

  let state = loadState();

  /* --- Render Helpers --- */

  function render() {
    renderBalances();
    renderTransactions();
  }

  function renderBalances() {
    const { need, wants, savings } = state.wallets;
    const total = need + wants + savings;
    document.getElementById('totalBalance').textContent   = formatRupiah(total);
    document.getElementById('needBalance').textContent    = formatRupiah(need);
    document.getElementById('wantsBalance').textContent   = formatRupiah(wants);
    document.getElementById('savingsBalance').textContent = formatRupiah(savings);
  }

  function renderTransactions() {
    const tbody  = document.getElementById('transactionBody');
    const empty  = document.getElementById('emptyState');
    const sorted = [...state.transactions].sort((a, b) => b.id.localeCompare(a.id));

    tbody.innerHTML = '';

    if (sorted.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    sorted.forEach(tx => {
      const isIncome = tx.type === 'income';
      const row = document.createElement('tr');
      row.style.borderTop = '1px solid #f8fafc';

      row.innerHTML = `
        <td class="px-5 py-3" style="color:#64748b;white-space:nowrap;font-size:.8125rem">${formatDate(tx.date)}</td>
        <td class="px-5 py-3" style="color:#334155;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem">${escapeHtml(tx.description)}</td>
        <td class="px-5 py-3">${renderCategoryBadge(tx.category)}</td>
        <td class="px-5 py-3">${isIncome
          ? '<span style="font-size:.6875rem;font-weight:600;background:#e0f2fe;color:#0284c7;padding:.2rem .55rem;border-radius:9999px">Masuk</span>'
          : '<span style="font-size:.6875rem;font-weight:600;background:#fff7ed;color:#ea580c;padding:.2rem .55rem;border-radius:9999px">Keluar</span>'
        }</td>
        <td class="px-5 py-3" style="text-align:right;font-weight:600;white-space:nowrap;color:${isIncome ? '#059669' : '#ef4444'};font-size:.8125rem">
          ${isIncome ? '+' : '−'}${formatRupiah(tx.amount)}
        </td>
        <td class="px-5 py-3" style="text-align:center">
          <button class="btn-icon" onclick="window._ftDeleteTx('${tx.id}')" title="Hapus transaksi">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  /* Expose delete to global scope for inline onclick */
  window._ftDeleteTx = function(id) {
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tx = state.transactions[idx];

    if (tx.type === 'income') {
      if (tx.category === 'split' && tx.splitDetail) {
        state.wallets.need    -= tx.splitDetail.need    || 0;
        state.wallets.wants   -= tx.splitDetail.wants   || 0;
        state.wallets.savings -= tx.splitDetail.savings || 0;
      } else {
        state.wallets[tx.category] -= tx.amount;
      }
    } else {
      state.wallets[tx.category] += tx.amount;
    }

    state.transactions.splice(idx, 1);
    saveState(state);
    render();
    showToast('Transaksi dihapus.', 'neutral');
  };

  function addTransaction(tx) {
    state.transactions.push(tx);
    saveState(state);
    render();
  }

  /* --- Income Form --- */
  document.getElementById('incomeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const amountRaw = parseFloat(document.getElementById('incomeAmount').value);
    const desc  = document.getElementById('incomeDesc').value.trim() || 'Pemasukan';
    const mode  = document.querySelector('input[name="incomeMode"]:checked').value;

    if (!amountRaw || amountRaw <= 0) { showToast('Masukkan nominal yang valid.', 'error'); return; }
    const amount = Math.floor(amountRaw);
    const date   = todayISO();

    if (mode === 'manual') {
      const wallet = document.getElementById('incomeWallet').value;
      state.wallets[wallet] += amount;
      addTransaction({ id: generateId(), date, description: desc, category: wallet, type: 'income', amount });
      showToast(`+${formatRupiah(amount)} → ${walletLabel(wallet)}`, 'success');
    } else {
      const pNeed    = parseInt(document.getElementById('splitNeed').value);
      const pWants   = parseInt(document.getElementById('splitWants').value);
      const pSavings = Math.max(0, 100 - pNeed - pWants);
      const aNeed    = Math.floor(amount * pNeed  / 100);
      const aWants   = Math.floor(amount * pWants / 100);
      const aSavings = amount - aNeed - aWants;

      state.wallets.need    += aNeed;
      state.wallets.wants   += aWants;
      state.wallets.savings += aSavings;

      addTransaction({
        id: generateId(), date,
        description: `${desc} (Split ${pNeed}%/${pWants}%/${pSavings}%)`,
        category: 'split', type: 'income', amount,
        splitDetail: { need: aNeed, wants: aWants, savings: aSavings },
      });
      showToast(`Split: Need ${formatRupiah(aNeed)} | Wants ${formatRupiah(aWants)} | Tab. ${formatRupiah(aSavings)}`, 'success');
    }

    this.reset();
    document.getElementById('splitNeed').value  = 50;
    document.getElementById('splitWants').value = 30;
    updateSplitUI();
  });

  /* --- Expense Form --- */
  document.getElementById('expenseForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const desc      = document.getElementById('expenseDesc').value.trim();
    const amountRaw = parseFloat(document.getElementById('expenseAmount').value);
    const date      = document.getElementById('expenseDate').value;
    const category  = document.getElementById('expenseCategory').value;

    if (category === 'savings') { showToast('Tabungan tidak bisa untuk pengeluaran!', 'error'); return; }
    if (!desc)     { showToast('Masukkan deskripsi pengeluaran.', 'error'); return; }
    if (!amountRaw || amountRaw <= 0) { showToast('Masukkan nominal yang valid.', 'error'); return; }
    if (!date)     { showToast('Pilih tanggal transaksi.', 'error'); return; }

    const amount = Math.floor(amountRaw);

    if (amount > state.wallets[category]) {
      const wt = document.getElementById('balanceWarningText');
      wt.textContent = `Saldo ${walletLabel(category)} tidak cukup. Sisa: ${formatRupiah(state.wallets[category])}`;
      document.getElementById('balanceWarning').classList.remove('hidden');
      return;
    }

    document.getElementById('balanceWarning').classList.add('hidden');
    state.wallets[category] -= amount;
    addTransaction({ id: generateId(), date, description: desc, category, type: 'expense', amount });
    showToast(`−${formatRupiah(amount)} dari ${walletLabel(category)}`, 'warning');
    this.reset();
    document.getElementById('expenseDate').value = todayISO();
  });

  ['expenseCategory', 'expenseAmount'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      document.getElementById('balanceWarning').classList.add('hidden');
    });
  });

  /* --- Mode Switch (Manual ↔ Split) --- */
  document.querySelectorAll('input[name="incomeMode"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const isSplit = this.value === 'split';
      document.getElementById('manualWalletSection').classList.toggle('hidden', isSplit);
      document.getElementById('splitSection').classList.toggle('hidden', !isSplit);
    });
  });

  /* --- Split Slider --- */
  function updateSplitUI() {
    const pNeed  = parseInt(document.getElementById('splitNeed').value);
    const pWants = parseInt(document.getElementById('splitWants').value);
    const pSav   = Math.max(0, 100 - pNeed - pWants);
    document.getElementById('splitNeedVal').textContent    = `${pNeed}%`;
    document.getElementById('splitWantsVal').textContent   = `${pWants}%`;
    document.getElementById('splitSavingsVal').textContent = `${pSav}%`;
    document.getElementById('splitSavingsBar').style.width = `${pSav}%`;
  }
  document.getElementById('splitNeed').addEventListener('input',  updateSplitUI);
  document.getElementById('splitWants').addEventListener('input', updateSplitUI);

  /* --- Clear All Modal --- */
  const confirmModal = document.getElementById('confirmModal');
  document.getElementById('clearAllBtn').addEventListener('click', () => confirmModal.classList.remove('hidden'));
  document.getElementById('confirmCancel').addEventListener('click', () => confirmModal.classList.add('hidden'));
  document.getElementById('confirmDelete').addEventListener('click', () => {
    state = structuredClone(DEFAULT_STATE);
    saveState(state);
    render();
    confirmModal.classList.add('hidden');
    showToast('Semua data telah dihapus.', 'neutral');
  });
  confirmModal.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });

  /* --- Init --- */
  document.getElementById('expenseDate').value = todayISO();
  render();
}

/* =====================================================================
 * ================================================================
 * MODULE 2 — TRACKING.HTML (Analitik Bulanan + Chart.js)
 * ================================================================
 * ===================================================================== */

function initTrackingPage() {
  if (!document.getElementById('monthlyChart')) return;

  const state = loadState();

  /* ---- Aggregate data per bulan ---- */
  /**
   * Mengelompokkan transaksi per bulan (YYYY-MM).
   * @returns {Map<string, {income: number, expense: number}>}
   */
  function buildMonthlyData() {
    const map = new Map();

    state.transactions.forEach(tx => {
      const key = monthKey(tx.date);
      if (!key) return;
      if (!map.has(key)) map.set(key, { income: 0, expense: 0 });
      const entry = map.get(key);
      if (tx.type === 'income')  entry.income  += tx.amount;
      if (tx.type === 'expense') entry.expense += tx.amount;
    });

    // Urutkan berdasarkan key (YYYY-MM) ascending
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }

  const monthly = buildMonthlyData();
  const keys    = [...monthly.keys()];
  const labels  = keys.map(formatMonthLabel);
  const incomes  = keys.map(k => monthly.get(k).income);
  const expenses = keys.map(k => monthly.get(k).expense);

  /* ---- Summary Cards ---- */
  const totalIncome  = incomes.reduce((s, v) => s + v, 0);
  const totalExpense = expenses.reduce((s, v) => s + v, 0);
  const netFlow      = totalIncome - totalExpense;

  document.getElementById('statTotalIncome').textContent  = formatRupiah(totalIncome);
  document.getElementById('statTotalExpense').textContent = formatRupiah(totalExpense);

  const netEl = document.getElementById('statNetFlow');
  netEl.textContent = formatRupiah(netFlow);
  netEl.style.color = netFlow >= 0 ? '#059669' : '#ef4444';

  /* ---- Chart.js Bar Chart ---- */
  const canvas = document.getElementById('monthlyChart');

  if (keys.length === 0) {
    // Tampilkan empty state chart
    const wrapper = document.getElementById('chartWrapper');
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:260px;color:#94a3b8;font-size:.875rem">
          Belum ada data transaksi untuk ditampilkan.
        </div>`;
    }
  } else {
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pemasukan',
            data: incomes,
            backgroundColor: 'rgba(5, 150, 105, 0.75)',
            borderColor: '#059669',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Pengeluaran',
            data: expenses,
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Inter, system-ui, sans-serif', size: 12 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${formatRupiah(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Inter, system-ui, sans-serif', size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: {
              font: { family: 'Inter, system-ui, sans-serif', size: 11 },
              callback: v => 'Rp ' + new Intl.NumberFormat('id-ID').format(v),
            },
            grid: { color: '#f1f5f9' },
          },
        },
      },
    });
  }

  /* ---- Monthly Summary Table ---- */
  const tbody = document.getElementById('monthlyTableBody');
  const emptyTable = document.getElementById('tableEmpty');

  if (keys.length === 0) {
    if (emptyTable) emptyTable.classList.remove('hidden');
  } else {
    if (emptyTable) emptyTable.classList.add('hidden');

    keys.forEach(key => {
      const { income, expense } = monthly.get(key);
      const net = income - expense;
      const isSurplus = net >= 0;

      const row = document.createElement('tr');
      row.style.borderTop = '1px solid #f1f5f9';
      row.innerHTML = `
        <td class="px-5 py-3" style="font-size:.8125rem;color:#334155;font-weight:500">${formatMonthLabel(key)}</td>
        <td class="px-5 py-3" style="font-size:.8125rem;color:#059669;font-weight:600;text-align:right">${formatRupiah(income)}</td>
        <td class="px-5 py-3" style="font-size:.8125rem;color:#ef4444;font-weight:600;text-align:right">${formatRupiah(expense)}</td>
        <td class="px-5 py-3" style="font-size:.8125rem;color:${isSurplus ? '#059669' : '#ef4444'};font-weight:700;text-align:right">${isSurplus ? '+' : '−'}${formatRupiah(Math.abs(net))}</td>
        <td class="px-5 py-3" style="text-align:center">
          <span class="badge ${isSurplus ? 'badge-surplus' : 'badge-defisit'}">${isSurplus ? 'Surplus' : 'Defisit'}</span>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
}

/* =====================================================================
 * ================================================================
 * MODULE 3 — HUTANG.HTML (Pencatatan Utang & Piutang)
 * ================================================================
 * ===================================================================== */

function initHutangPage() {
  if (!document.getElementById('debtForm')) return;

  let debts  = loadDebts();
  let filter = 'all'; // 'all' | 'belum' | 'lunas'

  /* ---- Summary Cards ---- */
  function renderSummary() {
    const activeDebts = debts.filter(d => !d.settled);
    const totalPiutang = activeDebts.filter(d => d.type === 'piutang').reduce((s, d) => s + d.amount, 0);
    const totalHutang  = activeDebts.filter(d => d.type === 'hutang').reduce((s, d) => s + d.amount, 0);

    document.getElementById('statPiutang').textContent = formatRupiah(totalPiutang);
    document.getElementById('statHutang').textContent  = formatRupiah(totalHutang);
  }

  /* ---- Render Table ---- */
  function renderTable() {
    const tbody = document.getElementById('debtTableBody');
    const empty = document.getElementById('debtEmpty');

    let filtered = debts;
    if (filter === 'belum') filtered = debts.filter(d => !d.settled);
    if (filter === 'lunas') filtered = debts.filter(d => d.settled);

    // Urutkan: belum lunas duluan, lalu by id desc
    filtered = [...filtered].sort((a, b) => {
      if (a.settled !== b.settled) return a.settled ? 1 : -1;
      return b.id.localeCompare(a.id);
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    filtered.forEach(d => {
      const isPiutang = d.type === 'piutang';
      const row = document.createElement('tr');
      row.style.borderTop = '1px solid #f1f5f9';

      row.innerHTML = `
        <td class="px-4 py-3" style="text-align:center">
          <span class="badge ${d.settled ? 'badge-lunas' : 'badge-belum'}">${d.settled ? 'Lunas' : 'Belum Lunas'}</span>
        </td>
        <td class="px-4 py-3" style="font-size:.8125rem">
          <span style="font-size:.6875rem;font-weight:600;padding:.2rem .55rem;border-radius:9999px;background:${isPiutang ? '#e0f2fe' : '#fff7ed'};color:${isPiutang ? '#0369a1' : '#c2410c'}">
            ${isPiutang ? 'Piutang' : 'Hutang'}
          </span>
        </td>
        <td class="px-4 py-3" style="font-size:.8125rem;font-weight:600;color:#1e293b">${escapeHtml(d.party)}</td>
        <td class="px-4 py-3" style="font-size:.8125rem;font-weight:700;color:${isPiutang ? '#059669' : '#ef4444'};text-align:right">${formatRupiah(d.amount)}</td>
        <td class="px-4 py-3" style="font-size:.8125rem;color:#64748b;white-space:nowrap">${formatDate(d.dateFrom)}</td>
        <td class="px-4 py-3" style="font-size:.8125rem;color:${isOverdue(d) ? '#ef4444' : '#64748b'};white-space:nowrap">${d.dateDue ? formatDate(d.dateDue) : '—'}</td>
        <td class="px-4 py-3" style="font-size:.8125rem;color:#64748b;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.note || '—')}</td>
        <td class="px-4 py-3" style="text-align:center;white-space:nowrap">
          <button class="btn-toggle" onclick="window._ftToggleDebt('${d.id}')" style="margin-right:.25rem">
            ${d.settled ? 'Buka Kembali' : 'Tandai Lunas'}
          </button>
          <button class="btn-icon" onclick="window._ftDeleteDebt('${d.id}')" title="Hapus">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  function isOverdue(d) {
    if (d.settled || !d.dateDue) return false;
    return todayISO() > d.dateDue;
  }

  function renderAll() {
    renderSummary();
    renderTable();
  }

  /* ---- Global handlers for inline onclick ---- */
  window._ftToggleDebt = function(id) {
    const d = debts.find(x => x.id === id);
    if (!d) return;
    d.settled = !d.settled;
    saveDebts(debts);
    renderAll();
    showToast(d.settled ? 'Ditandai lunas ✓' : 'Dibuka kembali.', d.settled ? 'success' : 'neutral');
  };

  window._ftDeleteDebt = function(id) {
    debts = debts.filter(x => x.id !== id);
    saveDebts(debts);
    renderAll();
    showToast('Catatan dihapus.', 'neutral');
  };

  /* ---- Debt Form ---- */
  document.getElementById('debtForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const type     = document.querySelector('input[name="debtType"]:checked').value;
    const party    = document.getElementById('debtParty').value.trim();
    const amountRaw = parseFloat(document.getElementById('debtAmount').value);
    const dateFrom = document.getElementById('debtDateFrom').value;
    const dateDue  = document.getElementById('debtDateDue').value;
    const note     = document.getElementById('debtNote').value.trim();

    if (!party)    { showToast('Masukkan nama pihak / orang.', 'error'); return; }
    if (!amountRaw || amountRaw <= 0) { showToast('Masukkan nominal yang valid.', 'error'); return; }
    if (!dateFrom) { showToast('Masukkan tanggal pinjam.', 'error'); return; }

    const newRecord = {
      id: generateId(),
      type,
      party,
      amount: Math.floor(amountRaw),
      dateFrom,
      dateDue: dateDue || '',
      note,
      settled: false,
    };

    debts.push(newRecord);
    saveDebts(debts);
    renderAll();
    showToast(`Catatan ${type === 'piutang' ? 'piutang' : 'hutang'} ditambahkan.`, 'success');
    this.reset();
    document.getElementById('debtDateFrom').value = todayISO();
  });

  /* ---- Filter Dropdown ---- */
  document.getElementById('debtFilter').addEventListener('change', function() {
    filter = this.value;
    renderTable();
  });

  /* ---- Init ---- */
  document.getElementById('debtDateFrom').value = todayISO();
  renderAll();
}

/* =====================================================================
 * BOOT — Jalankan modul sesuai halaman yang aktif
 * ===================================================================== */

document.addEventListener('DOMContentLoaded', function() {
  initIndexPage();
  initTrackingPage();
  initHutangPage();
});
