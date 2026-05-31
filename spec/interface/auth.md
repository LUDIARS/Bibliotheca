# 認証・認可

## 認証（Cernere SSO）
- フロント / API とも **Cernere PASETO V4** で認証。Bibliotheca は Cernere の
  **公開鍵を fetch** してローカル検証する（[`../../server/auth.ts`](../../server/auth.ts)）。
- 個人データは Cernere 単一情報源。Bibliotheca は `userId` と表示名のみ保持し、
  名前等は表示時に解決する。

## 認可
- 全 API は `requireAuth` を通る（未認証は 401）。
- **admin 専用**操作（機材/書籍マスタ登録、返却確定）は `requireAdmin`。
  admin は環境変数 `BIBLIOTHECA_ADMIN_IDS`（カンマ区切りの Cernere user id）で判定。
- 「貸出は本人」「返却は admin」を分離するのが基本ポリシー。

## 関連
- 公開鍵の取得・PASETO 検証の前提は [`../setup/setup.md`](../setup/setup.md)。
- 返却の token ランデブーは [`../feature/return.md`](../feature/return.md)。
