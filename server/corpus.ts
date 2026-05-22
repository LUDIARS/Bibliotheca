// Corpus 連携 — サービスマニフェスト + 宣言的 UI descriptor。
//
// Corpus (LUDIARS の hub) は GET /.well-known/corpus-service.json を読み、
// declarative panel の descriptor を内蔵レンダラで描く (Corpus DESIGN.md §13)。
// 自前 SPA はこれと別に当面残す (本マニフェスト追加は非破壊)。
//
// 注: 貸出はカメラスキャン主体だが、 宣言フォームでは external_key 手入力で
// 行う。 カメラスキャナは将来 `custom` component (Web Component) で足す。

// ── マニフェスト型 (Corpus server/hub/manifest.ts のミラー + §13) ──────────

interface ManifestDataEndpoint {
  id: string;
  /** サービス内のパス。 :param を含めてよい。 */
  path: string;
  scope: 'local' | 'multi';
  title?: string;
}

interface ActionDescriptor {
  label: string;
  dataId: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params?: Record<string, string>;
  body?: Record<string, string>;
  confirm?: string;
  success?: string;
  requires?: 'admin';
}

interface FormField {
  name: string;
  label: string;
  input: 'text' | 'textarea' | 'number' | 'select' | 'datetime' | 'date' | 'checkbox';
  required?: boolean;
  maxLength?: number;
  /** 静的選択肢 (固定 enum)。 */
  options?: { label: string; value: string }[];
}

interface FormComponent {
  type: 'form';
  submit: { dataId: string; method: 'POST' | 'PATCH'; success?: string };
  fields: FormField[];
}

interface ListComponent {
  type: 'list';
  dataSource: string;
  itemsPath?: string;
  itemKey: string;
  empty?: string;
  item: {
    title: string;
    subtitle?: string;
    body?: string;
    meta?: string;
    actions?: ActionDescriptor[];
  };
}

type ComponentDescriptor = FormComponent | ListComponent;

interface SectionDescriptor {
  title?: string;
  components: ComponentDescriptor[];
}

interface PanelDescriptor {
  descriptorVersion: 1;
  title: string;
  sections: SectionDescriptor[];
}

interface DeclarativePanel {
  id: string;
  kind: 'declarative';
  title: string;
  icon?: string;
  ui: PanelDescriptor;
}

export interface CorpusServiceManifest {
  service: string;
  displayName: string;
  version: string;
  corpusApi: number;
  health: string;
  auth: string;
  cernereProjectKey?: string;
  data: ManifestDataEndpoint[];
  panels: DeclarativePanel[];
}

// ── 貸出パネルの UI descriptor ─────────────────────────────────────────────

const loanPanel: PanelDescriptor = {
  descriptorVersion: 1,
  title: '蔵書・機材 貸出',
  sections: [
    {
      title: '貸出',
      components: [
        {
          type: 'form',
          submit: { dataId: 'loans', method: 'POST', success: '貸出を記録しました' },
          fields: [
            {
              name: 'source',
              label: '種別',
              input: 'select',
              required: true,
              options: [
                { label: '本 (ISBN)', value: 'book' },
                { label: '機材 (QR)', value: 'equipment' },
              ],
            },
            { name: 'external_key', label: 'ISBN / QR コード', input: 'text', required: true },
            { name: 'due_at', label: '返却期限', input: 'date' },
            { name: 'note', label: 'メモ', input: 'text', maxLength: 200 },
          ],
        },
      ],
    },
    {
      title: '貸出中',
      components: [
        {
          type: 'list',
          dataSource: 'loans-open',
          itemsPath: 'items',
          itemKey: 'id',
          empty: '貸出中の物品はありません',
          item: {
            title: '{label}',
            subtitle: '{external_key} ・ {borrowed_at|datetime}',
            meta: '{borrower_display_name}',
            actions: [
              {
                label: '返却',
                dataId: 'loan-return',
                method: 'POST',
                params: { id: '{id}' },
                confirm: '返却済みにしますか?',
                success: '返却しました',
                requires: 'admin',
              },
            ],
          },
        },
      ],
    },
    {
      title: '自分の貸出',
      components: [
        {
          type: 'list',
          dataSource: 'loans-mine',
          itemsPath: 'items',
          itemKey: 'id',
          empty: '借りている物品はありません',
          item: {
            title: '{label}',
            subtitle: '{external_key} ・ {borrowed_at|datetime}',
          },
        },
      ],
    },
  ],
};

// ── サービスマニフェスト ────────────────────────────────────────────────────

export const CORPUS_MANIFEST_PATH = '/.well-known/corpus-service.json';

export const corpusManifest: CorpusServiceManifest = {
  service: 'bibliotheca',
  displayName: 'Bibliotheca 貸出台帳',
  version: '0.1.0',
  corpusApi: 2,
  health: '/api/health',
  auth: 'cernere-project-token',
  cernereProjectKey: 'bibliotheca',
  data: [
    { id: 'loans-open', path: '/api/loans/open', scope: 'local', title: '貸出中' },
    { id: 'loans-mine', path: '/api/loans/mine', scope: 'local', title: '自分の貸出' },
    { id: 'loans', path: '/api/loans', scope: 'local', title: '貸出' },
    {
      id: 'loan-return',
      path: '/api/loans/:id/return',
      scope: 'local',
      title: '返却',
    },
  ],
  panels: [
    {
      id: 'loans',
      kind: 'declarative',
      title: '貸出台帳',
      icon: '📚',
      ui: loanPanel,
    },
  ],
};
