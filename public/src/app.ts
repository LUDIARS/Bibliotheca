// Bibliotheca フロントエンド — SPA + Cernere SSO 連携。
//
// タブ: 借りる / 自分の貸出 / 貸出中一覧 / 管理 (admin only)。
// 状態は閉じ込めて、 view 切替時に必要分だけ再 fetch する。

import {
  api,
  clearToken,
  getToken,
  type BookMeta,
  type EquipmentMeta,
  type LoanView,
  type MeResponse,
} from './api.ts';
import { startScan, stopScan, type ScanMode } from './scanner.ts';
import { openPrintWindow, renderQrSvg, type QrLabel } from './qr.ts';

type View = 'borrow' | 'mine' | 'open' | 'admin';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

const state = {
  me: null as MeResponse | null,
  view: 'borrow' as View,
  pendingLookup: null as
    | { source: 'book' | 'equipment'; key: string; meta: BookMeta | EquipmentMeta | null }
    | null,
};

function showToast(msg: string, kind: '' | 'ok' | 'err' = ''): void {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.hidden = false;
  window.setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function selectView(view: View): void {
  state.view = view;
  for (const tab of $$('.tab')) {
    tab.classList.toggle('active', tab.dataset.view === view);
  }
  for (const v of $$('.view')) {
    (v as HTMLElement).hidden = v.dataset.view !== view;
  }
  if (view === 'mine') {
    void renderMine();
    void refreshReturnQr();
  } else {
    stopReturnQrTimers();
  }
  if (view === 'open') void renderOpen();
  if (view === 'admin') void renderEquipList();
}

// ── 初期化 ──────────────────────────────────────────────
async function init(): Promise<void> {
  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => {
      const v = tab.dataset.view as View | undefined;
      if (v) selectView(v);
    });
  }

  const token = getToken();
  if (!token) {
    showLoginPrompt();
    return;
  }
  try {
    state.me = await api.me();
  } catch (e) {
    void e;
    clearToken();
    showLoginPrompt();
    return;
  }
  const me = state.me;
  const meBadge = $('#meBadge') as HTMLSpanElement;
  meBadge.textContent = me.displayName ?? me.userId;
  meBadge.hidden = false;
  if (me.isAdmin) {
    ($('#adminBadge') as HTMLSpanElement).hidden = false;
    const adminTab = document.querySelector('.tab[data-view="admin"]') as HTMLElement | null;
    if (adminTab) adminTab.hidden = false;
  }

  wireBorrowView();
  wireAdminView();
  wireMineToggle();
  wireMineReturnQr();
  wireAdminReturnScan();
}

function showLoginPrompt(): void {
  const cernereBase =
    (window as unknown as { CERNERE_BASE_URL?: string }).CERNERE_BASE_URL ??
    'http://localhost:8080';
  const returnUrl = encodeURIComponent(location.origin + location.pathname);
  const projectKey = 'bibliotheca';
  const loginUrl =
    `${cernereBase}/auth/login?` +
    `project=${projectKey}&return=${returnUrl}`;
  const content = $('.content');
  content.innerHTML = `
    <div class="panel foundation-form" style="max-width: 420px; margin: 40px auto;">
      <h2>サインイン</h2>
      <p class="muted">Bibliotheca を使うには Cernere でサインインしてください。</p>
      <div class="simple-actions">
        <a class="primary" href="${loginUrl}" style="text-decoration: none; display: inline-block;">Cernere でサインイン</a>
      </div>
    </div>
  `;
  const tabbar = document.getElementById('tabbar');
  if (tabbar) tabbar.hidden = true;
}

// ── Borrow view ─────────────────────────────────────────
function wireBorrowView(): void {
  $('#scanBookBtn').addEventListener('click', () => void openScanner('book', 'manualKey', 'book'));
  $('#scanQrBtn').addEventListener('click', () => void openScanner('qr', 'manualKey', 'equipment'));
  $('#scannerCancel').addEventListener('click', () => void closeScanner());
  $('#lookupBtn').addEventListener('click', () => void runLookup());
  $('#borrowBtn').addEventListener('click', () => void runBorrow());
  ($('#manualKey') as HTMLInputElement).addEventListener('input', () => {
    state.pendingLookup = null;
    ($('#borrowBtn') as HTMLButtonElement).disabled = true;
    $('#lookupResult').textContent = '';
    $('#lookupResult').className = 'lookup-result';
  });
}

async function openScanner(
  mode: ScanMode,
  targetInputId: string,
  source: 'book' | 'equipment',
): Promise<void> {
  const area = $('#scannerArea') as HTMLElement;
  const video = $('#scannerVideo') as HTMLVideoElement;
  area.hidden = false;
  try {
    await startScan(video, mode, (text) => {
      ($(`#${targetInputId}`) as HTMLInputElement).value = text;
      ($('#manualSource') as HTMLSelectElement).value = source;
      void closeScanner();
      void runLookup();
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`カメラを開けませんでした: ${msg}`, 'err');
    await closeScanner();
  }
}

async function closeScanner(): Promise<void> {
  await stopScan();
  ($('#scannerArea') as HTMLElement).hidden = true;
}

async function runLookup(): Promise<void> {
  const key = ($('#manualKey') as HTMLInputElement).value.trim();
  const source = ($('#manualSource') as HTMLSelectElement).value as
    | 'book'
    | 'equipment';
  const resultEl = $('#lookupResult');
  if (!key) {
    resultEl.textContent = 'key を入力してください';
    resultEl.className = 'lookup-result err';
    return;
  }
  resultEl.textContent = '照会中…';
  resultEl.className = 'lookup-result';
  try {
    const res = await api.lookup(source, key);
    state.pendingLookup = { source, key, meta: res.meta };
    if (source === 'book') {
      const m = res.meta as BookMeta;
      resultEl.innerHTML =
        `<div class="title">📖 ${escapeHtml(m.title)}</div>` +
        `<div class="sub">${escapeHtml(m.author ?? '')}${m.publisher ? ' / ' + escapeHtml(m.publisher) : ''}</div>` +
        `<div class="sub">ISBN: ${escapeHtml(m.isbn)}</div>`;
    } else {
      const m = res.meta as EquipmentMeta;
      resultEl.innerHTML =
        `<div class="title">🛠 ${escapeHtml(m.name)}</div>` +
        (m.spec ? `<div class="sub">${escapeHtml(m.spec)}</div>` : '') +
        `<div class="sub">QR: ${escapeHtml(m.qrCode)}</div>`;
    }
    ($('#borrowBtn') as HTMLButtonElement).disabled = false;
  } catch (e) {
    const err = e as { status?: number };
    state.pendingLookup = null;
    if (err.status === 404) {
      resultEl.textContent =
        source === 'book'
          ? '書誌が見つかりませんでした (OpenBD 未登録の可能性)'
          : '未登録の機材です。 admin に登録を依頼してください';
    } else {
      resultEl.textContent = '照会に失敗しました';
    }
    resultEl.className = 'lookup-result err';
    ($('#borrowBtn') as HTMLButtonElement).disabled = true;
  }
}

async function runBorrow(): Promise<void> {
  const p = state.pendingLookup;
  if (!p) return;
  const dueAt = ($('#dueAt') as HTMLInputElement).value || null;
  const note = ($('#note') as HTMLInputElement).value.trim() || null;
  try {
    const res = await api.borrow(p.source, p.key, dueAt, note);
    showToast(`借りました: ${res.loan.label ?? p.key}`, 'ok');
    // フォームを軽くリセット
    ($('#manualKey') as HTMLInputElement).value = '';
    ($('#note') as HTMLInputElement).value = '';
    ($('#dueAt') as HTMLInputElement).value = '';
    $('#lookupResult').textContent = '';
    ($('#borrowBtn') as HTMLButtonElement).disabled = true;
    state.pendingLookup = null;
  } catch (e) {
    const err = e as { status?: number; body?: { error?: string } };
    if (err.status === 409) {
      showToast('このアイテムは既に貸出中です', 'err');
    } else {
      showToast(`貸出に失敗しました (${err.body?.error ?? err.status ?? '?'})`, 'err');
    }
  }
}

// ── Mine view ───────────────────────────────────────────
function wireMineToggle(): void {
  ($('#mineIncludeReturned') as HTMLInputElement).addEventListener('change', () => {
    void renderMine();
  });
}

async function renderMine(): Promise<void> {
  const include = ($('#mineIncludeReturned') as HTMLInputElement).checked;
  const list = $('#mineList') as HTMLUListElement;
  list.innerHTML = '<li class="muted">読み込み中…</li>';
  try {
    const { items } = await api.listMine(include);
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<li class="muted">該当なし</li>';
      return;
    }
    for (const it of items) list.appendChild(renderLoanItem(it, false));
  } catch (e) {
    void e;
    list.innerHTML = '<li class="muted">読み込みに失敗しました</li>';
  }
}

// ── Open view ───────────────────────────────────────────
async function renderOpen(): Promise<void> {
  const list = $('#openList') as HTMLUListElement;
  list.innerHTML = '<li class="muted">読み込み中…</li>';
  try {
    const { items } = await api.listOpen();
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<li class="muted">貸出中のアイテムはありません</li>';
      return;
    }
    const isAdmin = state.me?.isAdmin ?? false;
    for (const it of items) list.appendChild(renderLoanItem(it, isAdmin));
  } catch (e) {
    void e;
    list.innerHTML = '<li class="muted">読み込みに失敗しました</li>';
  }
}

function renderLoanItem(it: LoanView, showReturnBtn: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'loan-item';
  const label = it.label ?? '(no label)';
  const sourceTag = it.source === 'book' ? '本' : '機材';
  li.innerHTML = `
    <div class="row1">
      <span class="source-tag ${it.source}">${sourceTag}</span>
      <span class="label">${escapeHtml(label)}</span>
      <span class="key">${escapeHtml(it.external_key)}</span>
    </div>
    <div class="meta">
      ${escapeHtml(it.borrower_display_name ?? it.borrower_user_id)} が
      ${escapeHtml(fmtDate(it.borrowed_at))} に貸出
      ${it.due_at ? '— 返却予定 ' + escapeHtml(it.due_at) : ''}
      ${it.returned_at ? '<span class="returned">— 返却済 ' + escapeHtml(fmtDate(it.returned_at)) + '</span>' : ''}
    </div>
    ${it.note ? `<div class="meta">📝 ${escapeHtml(it.note)}</div>` : ''}
  `;
  if (showReturnBtn && !it.returned_at) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'danger';
    btn.textContent = '返却済にする';
    btn.addEventListener('click', () => void onReturn(it.id, btn));
    actions.appendChild(btn);
    li.appendChild(actions);
  }
  return li;
}

async function onReturn(loanId: number, btn: HTMLButtonElement): Promise<void> {
  if (!confirm('このアイテムを返却済にしますか?')) return;
  btn.disabled = true;
  try {
    await api.returnLoan(loanId);
    showToast('返却しました', 'ok');
    void renderOpen();
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 403) {
      showToast('返却は管理者のみ実行できます', 'err');
    } else {
      showToast('返却に失敗しました', 'err');
    }
    btn.disabled = false;
  }
}

// ── Admin (equipment master) view ───────────────────────
const adminState = {
  cachedEquip: [] as Array<{ qr_code: string; name: string; spec: string | null }>,
  selected: new Set<string>(),
};

function wireAdminView(): void {
  $('#scanEquipQrBtn').addEventListener('click', () =>
    void openScanner('qr', 'equipQr', 'equipment'),
  );
  $('#equipSaveBtn').addEventListener('click', () => void onSaveEquipment());
  $('#bulkEquipPreviewBtn').addEventListener('click', () => onBulkEquipPreview());
  $('#bulkEquipSubmitBtn').addEventListener('click', () => void onBulkEquipSubmit());
  $('#bulkBooksSubmitBtn').addEventListener('click', () => void onBulkBooksSubmit());
  $('#printAllQrBtn').addEventListener('click', () => void onPrintAllQr());
  $('#printSelectedQrBtn').addEventListener('click', () => void onPrintSelectedQr());
}

async function onSaveEquipment(): Promise<void> {
  const qr = ($('#equipQr') as HTMLInputElement).value.trim();
  const name = ($('#equipName') as HTMLInputElement).value.trim();
  const spec = ($('#equipSpec') as HTMLInputElement).value.trim() || null;
  if (!name) {
    showToast('名前は必須です', 'err');
    return;
  }
  try {
    const res = await api.registerEquipment(qr, name, spec);
    showToast(
      res.generated_qr ? `機材を登録しました (QR: ${res.equipment.qr_code} を発行)` : '機材を登録しました',
      'ok',
    );
    ($('#equipQr') as HTMLInputElement).value = '';
    ($('#equipName') as HTMLInputElement).value = '';
    ($('#equipSpec') as HTMLInputElement).value = '';
    void renderEquipList();
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 403) {
      showToast('管理者のみ登録できます', 'err');
    } else {
      showToast('登録に失敗しました', 'err');
    }
  }
}

// ── CSV / 改行入力をパースする ───────────────────────────
interface ParsedRow {
  qr_code: string;
  name: string;
  spec: string | null;
}
function parseBulkEquip(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    // タブ or カンマ。 タブ区切り Excel コピペにも対応
    const parts = line.split(/\t|,/).map((s) => s.trim());
    const qr = parts[0] ?? '';
    const name = parts[1] ?? '';
    const spec = (parts[2] ?? '').trim();
    if (!name) {
      errors.push(`${i + 1} 行目: name が空 (${raw.slice(0, 40)})`);
      return;
    }
    rows.push({ qr_code: qr, name, spec: spec || null });
  });
  return { rows, errors };
}

function onBulkEquipPreview(): void {
  const text = ($('#bulkEquipText') as HTMLTextAreaElement).value;
  const { rows, errors } = parseBulkEquip(text);
  const preview = $('#bulkEquipPreview');
  const lines: string[] = [];
  lines.push(`<div class="summary">${rows.length} 件 (パースエラー ${errors.length})</div>`);
  if (errors.length > 0) {
    lines.push('<ul>' + errors.slice(0, 10).map((e) => `<li class="err">${escapeHtml(e)}</li>`).join('') + '</ul>');
  }
  if (rows.length > 0) {
    lines.push('<ul>' + rows.slice(0, 10).map((r) =>
      `<li>${r.qr_code ? escapeHtml(r.qr_code) : '<em>(自動発行)</em>'} — ${escapeHtml(r.name)}${r.spec ? ' / ' + escapeHtml(r.spec) : ''}</li>`,
    ).join('') + (rows.length > 10 ? `<li>... 他 ${rows.length - 10} 件</li>` : '') + '</ul>');
  }
  preview.innerHTML = lines.join('');
}

async function onBulkEquipSubmit(): Promise<void> {
  const text = ($('#bulkEquipText') as HTMLTextAreaElement).value;
  const { rows, errors } = parseBulkEquip(text);
  if (rows.length === 0) {
    showToast('登録対象がありません', 'err');
    return;
  }
  if (errors.length > 0 && !confirm(`${errors.length} 件のパースエラーがあります。 残り ${rows.length} 件を登録しますか?`)) {
    return;
  }
  try {
    const res = await api.bulkEquipment(rows);
    showToast(`一括登録: 成功 ${res.ok} / 失敗 ${res.errors}`, res.errors === 0 ? 'ok' : 'err');
    ($('#bulkEquipText') as HTMLTextAreaElement).value = '';
    $('#bulkEquipPreview').innerHTML = '';
    void renderEquipList();
  } catch (e) {
    const err = e as { status?: number };
    showToast(err.status === 403 ? '管理者のみ登録できます' : '一括登録に失敗しました', 'err');
  }
}

async function onBulkBooksSubmit(): Promise<void> {
  const text = ($('#bulkBooksText') as HTMLTextAreaElement).value;
  const isbns = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (isbns.length === 0) {
    showToast('ISBN がありません', 'err');
    return;
  }
  const resultEl = $('#bulkBooksResult');
  resultEl.innerHTML = '<div class="muted">取得中…</div>';
  try {
    const res = await api.bulkBooks(isbns);
    const lines: string[] = [];
    lines.push(`<div class="summary">${res.ok} / ${res.total} 件キャッシュ済</div>`);
    lines.push('<ul>' + res.results.map((r) =>
      r.ok
        ? `<li class="ok">✓ ${escapeHtml(r.isbn)} — ${escapeHtml(r.title ?? '')}</li>`
        : `<li class="err">× ${escapeHtml(r.isbn)} — 見つかりませんでした</li>`,
    ).join('') + '</ul>');
    resultEl.innerHTML = lines.join('');
    showToast(`書籍キャッシュ: ${res.ok} / ${res.total}`, res.ok === res.total ? 'ok' : '');
  } catch (e) {
    const err = e as { status?: number };
    resultEl.innerHTML = '';
    showToast(err.status === 403 ? '管理者のみ実行できます' : 'キャッシュ取得に失敗しました', 'err');
  }
}

async function onPrintAllQr(): Promise<void> {
  if (adminState.cachedEquip.length === 0) {
    showToast('印刷対象がありません', 'err');
    return;
  }
  await openPrintWindow(adminState.cachedEquip.map((e): QrLabel => ({
    qrCode: e.qr_code,
    name: e.name,
    spec: e.spec,
  })));
}

async function onPrintSelectedQr(): Promise<void> {
  const targets = adminState.cachedEquip.filter((e) => adminState.selected.has(e.qr_code));
  if (targets.length === 0) {
    showToast('印刷対象がありません', 'err');
    return;
  }
  await openPrintWindow(targets.map((e): QrLabel => ({
    qrCode: e.qr_code,
    name: e.name,
    spec: e.spec,
  })));
}

function updateSelectedCount(): void {
  ($('#qrSelectedCount') as HTMLSpanElement).textContent = String(adminState.selected.size);
  ($('#printSelectedQrBtn') as HTMLButtonElement).disabled = adminState.selected.size === 0;
}

async function renderEquipList(): Promise<void> {
  const list = $('#equipList') as HTMLUListElement;
  list.innerHTML = '<li class="muted">読み込み中…</li>';
  try {
    const { items } = await api.listEquipment();
    adminState.cachedEquip = items.map((e) => ({ qr_code: e.qr_code, name: e.name, spec: e.spec }));
    // 既に選択されていた qr_code は維持、 もう存在しないものは捨てる
    const validKeys = new Set(items.map((e) => e.qr_code));
    for (const k of Array.from(adminState.selected)) {
      if (!validKeys.has(k)) adminState.selected.delete(k);
    }
    updateSelectedCount();

    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<li class="muted">登録された機材はありません</li>';
      return;
    }
    for (const e of items) {
      const li = document.createElement('li');
      li.className = 'equip-item';
      const checked = adminState.selected.has(e.qr_code) ? 'checked' : '';
      li.innerHTML = `
        <div class="pick"><input type="checkbox" data-qr="${escapeHtml(e.qr_code)}" ${checked} /></div>
        <div class="body">
          <div class="name">${escapeHtml(e.name)}</div>
          ${e.spec ? `<div class="spec">${escapeHtml(e.spec)}</div>` : ''}
          <div class="qr">QR: ${escapeHtml(e.qr_code)}</div>
        </div>
      `;
      const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement;
      cb.addEventListener('change', () => {
        if (cb.checked) adminState.selected.add(e.qr_code);
        else adminState.selected.delete(e.qr_code);
        updateSelectedCount();
      });
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="muted">読み込みに失敗しました</li>';
  }
}

// ── 返却 QR (ゲスト側) ──────────────────────────────────
const returnQrState = {
  token: null as string | null,
  expiresAt: 0,
  refreshTimer: 0,
  countdownTimer: 0,
};

function stopReturnQrTimers(): void {
  if (returnQrState.refreshTimer) {
    clearTimeout(returnQrState.refreshTimer);
    returnQrState.refreshTimer = 0;
  }
  if (returnQrState.countdownTimer) {
    clearInterval(returnQrState.countdownTimer);
    returnQrState.countdownTimer = 0;
  }
}

async function refreshReturnQr(): Promise<void> {
  stopReturnQrTimers();
  const svgHost = $('#returnQrSvg');
  const countdownEl = $('#returnQrCountdown');
  svgHost.innerHTML = '<span class="muted">発行中…</span>';
  try {
    const { token, expiresAt } = await api.issueReturnToken();
    returnQrState.token = token;
    returnQrState.expiresAt = new Date(expiresAt).getTime();
    const svg = await renderQrSvg(token);
    svgHost.innerHTML = svg;
    // 期限の 10s 前に自動再発行
    const ttlMs = Math.max(returnQrState.expiresAt - Date.now(), 5_000);
    returnQrState.refreshTimer = window.setTimeout(
      () => void refreshReturnQr(),
      Math.max(ttlMs - 10_000, 5_000),
    );
    returnQrState.countdownTimer = window.setInterval(() => {
      if (state.view !== 'mine') {
        stopReturnQrTimers();
        return;
      }
      const remaining = Math.max(0, Math.ceil((returnQrState.expiresAt - Date.now()) / 1000));
      countdownEl.textContent = String(remaining);
    }, 500);
  } catch {
    svgHost.innerHTML = '<span class="muted">QR 発行に失敗しました</span>';
    countdownEl.textContent = '--';
  }
}

function wireMineReturnQr(): void {
  const btn = $('#returnQrRefreshBtn');
  btn.addEventListener('click', () => void refreshReturnQr());
}

// ── 返却ランデブー (admin 側) ──────────────────────────
const adminReturnState = {
  token: null as string | null,
  selectedLoanIds: new Set<number>(),
  loans: [] as LoanView[],
};

function wireAdminReturnScan(): void {
  $('#adminReturnScanBtn').addEventListener('click', () => void openAdminReturnScanner());
  $('#adminReturnScannerCancel').addEventListener('click', () => void closeAdminReturnScanner());
  $('#adminReturnConfirmBtn').addEventListener('click', () => void confirmAdminReturn());
  $('#adminReturnResetBtn').addEventListener('click', () => resetAdminReturnResult());
}

async function openAdminReturnScanner(): Promise<void> {
  resetAdminReturnResult();
  const area = $('#adminReturnScannerArea') as HTMLElement;
  const video = $('#adminReturnVideo') as HTMLVideoElement;
  area.hidden = false;
  try {
    await startScan(video, 'qr' as ScanMode, (text) => {
      void onAdminReturnScanned(text);
    });
  } catch {
    showToast('カメラを起動できませんでした', 'err');
    area.hidden = true;
  }
}

async function closeAdminReturnScanner(): Promise<void> {
  await stopScan();
  ($('#adminReturnScannerArea') as HTMLElement).hidden = true;
}

async function onAdminReturnScanned(text: string): Promise<void> {
  // 1 回読めたら止める (連続発火を避ける)
  await closeAdminReturnScanner();
  try {
    const res = await api.lookupReturnToken(text.trim());
    adminReturnState.token = text.trim();
    adminReturnState.loans = res.openLoans;
    adminReturnState.selectedLoanIds.clear();
    renderAdminReturnList(res.borrower);
  } catch (e) {
    const err = e as { status?: number; body?: { error?: string } };
    if (err.status === 404) {
      showToast('QR が無効または期限切れです', 'err');
    } else {
      showToast(`スキャン結果の解決に失敗しました (${err.body?.error ?? err.status ?? '?'})`, 'err');
    }
  }
}

function renderAdminReturnList(
  borrower: { userId: string; displayName: string | null },
): void {
  const wrap = $('#adminReturnResult') as HTMLElement;
  const nameEl = $('#adminReturnBorrower');
  const list = $('#adminReturnLoanList') as HTMLUListElement;
  const btn = $('#adminReturnConfirmBtn') as HTMLButtonElement;

  nameEl.textContent =
    borrower.displayName ?? `user-${borrower.userId.slice(0, 8)}`;
  list.innerHTML = '';
  if (adminReturnState.loans.length === 0) {
    list.innerHTML = '<li class="muted">貸出中のアイテムはありません</li>';
    btn.disabled = true;
  } else {
    for (const loan of adminReturnState.loans) {
      const li = document.createElement('li');
      li.innerHTML = `
        <label class="loan-pick">
          <input type="checkbox" data-loan-id="${loan.id}" />
          <span>
            <strong>${escapeHtml(loan.label ?? loan.external_key)}</strong>
            <small>${loan.source === 'book' ? '📖 本' : '🔧 機材'} ・ ${escapeHtml(loan.external_key)}</small>
            <small>${fmtDate(loan.borrowed_at)} に貸出</small>
          </span>
        </label>
      `;
      const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement;
      cb.addEventListener('change', () => {
        if (cb.checked) adminReturnState.selectedLoanIds.add(loan.id);
        else adminReturnState.selectedLoanIds.delete(loan.id);
        btn.disabled = adminReturnState.selectedLoanIds.size === 0;
      });
      list.appendChild(li);
    }
    btn.disabled = true;
  }
  wrap.hidden = false;
}

async function confirmAdminReturn(): Promise<void> {
  if (!adminReturnState.token) return;
  const ids = Array.from(adminReturnState.selectedLoanIds);
  if (ids.length === 0) return;
  try {
    const res = await api.confirmReturnBatch(adminReturnState.token, ids);
    showToast(
      `${res.returned.length} 件を返却しました${res.skipped.length ? ` (スキップ ${res.skipped.length})` : ''}`,
      'ok',
    );
    resetAdminReturnResult();
  } catch (e) {
    const err = e as { status?: number; body?: { error?: string } };
    showToast(`返却に失敗しました (${err.body?.error ?? err.status ?? '?'})`, 'err');
  }
}

function resetAdminReturnResult(): void {
  adminReturnState.token = null;
  adminReturnState.loans = [];
  adminReturnState.selectedLoanIds.clear();
  ($('#adminReturnResult') as HTMLElement).hidden = true;
}

// ── helpers ─────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

void init();
