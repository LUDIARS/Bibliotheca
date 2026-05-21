// Bibliotheca の Corpus 用 UI コンポーネント (VantanHub-DESIGN.md D4)。
//
// Corpus frontend がサービスマニフェスト (/.well-known/corpus-service.json) を
// 読み、 このパネルを /hub-ui/bibliotheca/loans.js として動的 import して
// mount(container, ctx) を呼ぶ。 ctx.data('my-loans') が Corpus 経由で
// Bibliotheca の /api/loans/mine を叩く。
//
// 形式は「panel.js 方式」 — mount(el, ctx) を export する ESM を esbuild で
// バンドルする (Corpus / VantanHub のパネルと同形式)。

/** Corpus が mount() に渡すコンテキスト (Corpus public/src/types.ts と同形)。 */
interface ServicePanelContext {
  service: string;
  identity: { userId: string; displayName: string | null; isAdmin: boolean };
  data(dataId: string, init?: RequestInit): Promise<Response>;
}

interface LoanView {
  id?: number;
  source?: string;
  external_key?: string;
  label?: string | null;
  due_at?: string | null;
  returned_at?: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function loanItem(it: LoanView): HTMLElement {
  const li = el('li');
  li.style.padding = '0.45rem 0';
  li.style.borderBottom = '1px solid #252934';
  li.appendChild(el('strong', undefined, it.label ?? it.external_key ?? '(不明)'));
  li.appendChild(el('span', 'muted', `  ${it.source === 'book' ? '📖 本' : '🔧 機材'}`));
  if (it.due_at) li.appendChild(el('span', 'muted', `  返却期限: ${it.due_at}`));
  return li;
}

export async function mount(
  container: HTMLElement,
  ctx: ServicePanelContext,
): Promise<void> {
  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.gap = '0.8rem';
    head.appendChild(el('h2', undefined, '📚 Bibliotheca — 貸出'));
    const refresh = el('button', 'ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    let res: Response;
    try {
      res = await ctx.data('my-loans');
    } catch (e) {
      container.appendChild(el('p', 'error', `取得に失敗しました: ${String(e)}`));
      return;
    }
    if (!res.ok) {
      const box = el('div');
      box.appendChild(
        el('p', 'muted', `Bibliotheca のデータを取得できませんでした (${res.status})。`),
      );
      box.appendChild(
        el(
          'p',
          'muted',
          'Bibliotheca が稼働し、 Corpus の認証トークン伝播 (CORPUS_TOKEN_MODE) が ' +
            '設定されると表示されます。',
        ),
      );
      container.appendChild(box);
      return;
    }

    let items: LoanView[] = [];
    try {
      const body = (await res.json()) as { items?: LoanView[] };
      items = Array.isArray(body.items) ? body.items : [];
    } catch {
      container.appendChild(el('p', 'muted', '貸出データの解釈に失敗しました。'));
      return;
    }

    const open = items.filter((i) => !i.returned_at);
    const returned = items.filter((i) => i.returned_at);

    container.appendChild(el('h3', undefined, `借用中 (${open.length})`));
    if (open.length === 0) {
      container.appendChild(el('p', 'muted', '(借用中の本 / 機材はありません)'));
    } else {
      const ul = el('ul');
      ul.style.listStyle = 'none';
      ul.style.margin = '0';
      ul.style.padding = '0';
      for (const it of open) ul.appendChild(loanItem(it));
      container.appendChild(ul);
    }

    if (returned.length > 0) {
      container.appendChild(el('h3', undefined, `返却済み (${returned.length})`));
      const ul = el('ul');
      ul.style.listStyle = 'none';
      ul.style.margin = '0';
      ul.style.padding = '0';
      ul.style.opacity = '0.6';
      for (const it of returned) ul.appendChild(loanItem(it));
      container.appendChild(ul);
    }
  }

  await render();
}
