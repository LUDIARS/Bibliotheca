// Bibliotheca 宣言的 UI ブートストラップ — corpus-renderer を流用して
// `/.well-known/corpus-service.json` の loanPanel descriptor だけで UI を描く。
//
// Corpus DESIGN.md §13.8 step 4 (Bibliotheca / Actio を declarative panel 化、
// 自前 SPA 撤去) の段階的着手。 本ファイルは独立エントリ
// `public/declarative.html` から読み込まれ、 既存の `app.ts` SPA (camera scanner
// 含む) とは別 URL に置かれる。
//
// 取込スコープ (declarative で完結する範囲):
//   - 貸出フォーム (種別 / external_key / 期限 / メモ)
//   - 貸出中一覧 + 「返却」action (admin)
//   - 自分の貸出一覧
// 取込外 (`custom` 領域に残す):
//   - QR スキャン / ISBN バーコード読取 → 既存 app.ts に委ねる
//   - 機材マスタ管理画面 (admin) → 別途検討
//
// 既存 SPA は無改変で共存する (置き換えではなく追加)。

import { renderPanel } from './corpus-renderer/renderer.ts';
import type {
  PanelDescriptor,
  RenderContext,
} from './corpus-renderer/types.ts';

// ── manifest 型 (server/corpus.ts と同じ構造の最小サブセット) ────────────────

interface ManifestDataEndpoint {
  id: string;
  path: string;
  scope: 'local' | 'multi';
  title?: string;
}

interface DeclarativePanel {
  id: string;
  kind: 'declarative';
  title: string;
  ui: PanelDescriptor;
}

interface CorpusServiceManifest {
  service: string;
  displayName: string;
  corpusApi: number;
  data: ManifestDataEndpoint[];
  panels: DeclarativePanel[];
}

interface MeResponse {
  userId: string;
  displayName: string | null;
  isAdmin: boolean;
  cernereAccessToken?: string | null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;

function showToast(msg: string, ok: boolean): void {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + (ok ? 'ok' : 'err');
  el.hidden = false;
  window.setTimeout(() => { el.hidden = true; }, 2500);
}

// localStorage token (Bibliotheca SPA の cernere SSO と互換)。
function getToken(): string | null {
  return window.localStorage.getItem('bibliotheca_token');
}

// data() 実装 — manifest の dataId → endpoint path に解決して Bibliotheca に直叩き。
// path の :param は params から埋め、 query string が要るときは ?key=value で。
function makeDataFn(manifest: CorpusServiceManifest): RenderContext['data'] {
  const byId = new Map(manifest.data.map((d) => [d.id, d]));

  return async function data(dataId, opts) {
    const endpoint = byId.get(dataId);
    if (!endpoint) {
      throw new Error(`unknown dataId: ${dataId}`);
    }
    // :param を埋める。 残った params は ?query にする。
    let path = endpoint.path;
    const remaining: Record<string, string> = { ...(opts?.params || {}) };
    for (const key of Object.keys(remaining)) {
      const tag = `:${key}`;
      const val = remaining[key];
      if (val != null && path.includes(tag)) {
        path = path.replace(tag, encodeURIComponent(val));
        delete remaining[key];
      }
    }
    if (Object.keys(remaining).length) {
      const q = new URLSearchParams(remaining).toString();
      path += (path.includes('?') ? '&' : '?') + q;
    }

    const init: RequestInit = {
      method: opts?.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(opts?.body != null
            ? { 'content-type': 'application/json' }
            : {}),
      },
      credentials: 'include',
    };
    const token = getToken();
    if (token) {
      (init.headers as Record<string, string>).authorization = `Bearer ${token}`;
    }
    if (opts?.body != null) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    return fetch(path, init);
  };
}

// ── bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    // identity: Bibliotheca の既存 /api/me を使う (Cernere SSO 後に取れる)。
    const meRes = await fetch('/api/me', {
      headers: { authorization: `Bearer ${getToken() ?? ''}` },
      credentials: 'include',
    });
    if (!meRes.ok) {
      $('#root').innerHTML =
        '<p class="hint">サインインしてください — <a href="/">通常 UI</a> から Cernere でログイン</p>';
      return;
    }
    const me: MeResponse = await meRes.json();

    const manifestRes = await fetch('/.well-known/corpus-service.json');
    const manifest: CorpusServiceManifest = await manifestRes.json();

    if (!manifest.panels?.length) {
      $('#root').textContent = 'declarative panel が未定義です。';
      return;
    }
    const panel = manifest.panels[0];
    if (!panel) {
      $('#root').textContent = 'declarative panel が未定義です。';
      return;
    }

    const ctx: RenderContext = {
      identity: {
        userId: me.userId,
        displayName: me.displayName,
        isAdmin: me.isAdmin,
      },
      data: makeDataFn(manifest),
    };

    const root = $('#root');
    root.innerHTML = '';
    renderPanel(root, panel.ui, ctx);

    $('#header-title').textContent = panel.title;
    // showToast はサービスを跨いだ統一が無いので未使用。 renderer が
    // section-内 status span で結果を表示する (renderer.ts:113 / 338 / 468)。
    void showToast;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    $('#root').innerHTML = `<p class="hint err">init 失敗: ${msg}</p>`;
  }
}

void main();
