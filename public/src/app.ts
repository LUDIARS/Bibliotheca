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
  if (view === 'mine') void renderMine();
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
function wireAdminView(): void {
  $('#scanEquipQrBtn').addEventListener('click', () =>
    void openScanner('qr', 'equipQr', 'equipment'),
  );
  $('#equipSaveBtn').addEventListener('click', () => void onSaveEquipment());
}

async function onSaveEquipment(): Promise<void> {
  const qr = ($('#equipQr') as HTMLInputElement).value.trim();
  const name = ($('#equipName') as HTMLInputElement).value.trim();
  const spec = ($('#equipSpec') as HTMLInputElement).value.trim() || null;
  if (!qr || !name) {
    showToast('QR と 名前は必須です', 'err');
    return;
  }
  try {
    await api.registerEquipment(qr, name, spec);
    showToast('機材を登録しました', 'ok');
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

async function renderEquipList(): Promise<void> {
  const list = $('#equipList') as HTMLUListElement;
  list.innerHTML = '<li class="muted">読み込み中…</li>';
  try {
    const { items } = await api.listEquipment();
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<li class="muted">登録された機材はありません</li>';
      return;
    }
    for (const e of items) {
      const li = document.createElement('li');
      li.className = 'equip-item';
      li.innerHTML = `
        <div class="name">${escapeHtml(e.name)}</div>
        ${e.spec ? `<div class="spec">${escapeHtml(e.spec)}</div>` : ''}
        <div class="qr">QR: ${escapeHtml(e.qr_code)}</div>
      `;
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="muted">読み込みに失敗しました</li>';
  }
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
