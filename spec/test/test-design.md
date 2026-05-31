# テスト設計

方針は AIFormat [`RULE_TEST.md`](https://github.com/LUDIARS/AIFormat/blob/main/RULE_TEST.md)。
Bibliotheca は **Web サービス（貸出台帳）** 種別。重視点は貸出/返却の状態遷移と
認可境界（貸出=本人 / 返却=admin、未認証で破壊操作不可）。

## 現状
- **CLAUDE.md の方針**: v0.1 は手動確認、v0.2 で vitest を導入する計画。
- 現時点で自動テストは未整備（**ドキュメント充実度の gap**）。

## 種別ごとの「やること」（充実とみなす対象）

### ビルド / 型チェック
- [ ] `tsc` build / typecheck を CI で回す（CI 自体の整備が前段）。

### ユニット（DB / 純ロジック、in-memory SQLite）
- [ ] `db.ts` の貸出登録 → 同一アイテムの二重貸出防止（`idx_loan_open` 経由）。
- [ ] 返却で `returned_at` / `returned_by_user_id` がセットされる。
- [ ] `return_token` の発行 / 失効 / 単回消費（`consumed_at`）。
- [ ] `MasterSource` 抽象（OpenBD ルックアップのキャッシュヒット/ミス）。

### 統合（REST + 認可）
- [ ] `requireAuth` 無しで全 API が 401。
- [ ] `requireAdmin` 操作（機材/書籍登録・返却確定）が非 admin で 403。
- [ ] 返却ランデブー通し: `/returns/token` → `/returns/lookup` → `/returns/confirm`。

### smoke
- [ ] 起動 + `/api/health` + 未認証で保護ルート 401。

> 認証は Cernere 公開鍵 fetch に依存するため、統合テストはテスト用鍵注入 or
> Cernere stub が要る（Cernere 側の token ユニットは別途実装済）。
