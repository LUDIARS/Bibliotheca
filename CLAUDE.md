# Bibliotheca — Claude 向けメモ

## 性格

小さい単機能サービス。 本/機材の **貸出台帳に徹する**。
書誌/機材の中身を保持しない (= 外部マスタを `MasterSource` 経由で参照)。

## 触ってよい / よくない

- 触ってよい: `server/`, `public/`, `tsconfig*`, `package.json`, README
- 触らない: 他リポ (Cernere / Memoria 等) — Bibliotheca は単独完結
- DB schema 変更は migration を別途用意 (現状は CREATE IF NOT EXISTS のみ)

## アーキ要点

- Hono + better-sqlite3 + esbuild + tsx (Memoria pattern と同じ)
- Cernere PASETO V4 検証は `server/auth.ts` (公開鍵 6h 毎 refresh)
- 返却操作は `requireAdmin` middleware で保護 — `BIBLIOTHECA_ADMIN_IDS` を信頼源にする
- 個人データは Cernere 単一情報源、 自前 DB には `userId` (= Cernere sub) と
  display name の **キャッシュ** のみ保持
- 起動口は `server/bootstrap.ts`: Infisical machine identity (INFISICAL_*) →
  `ensureEnv()` で Infisical から secret fetch & inject → `index.ts` 読み込み。
  .env / .env.secrets / host env / Infisical を多段で merge する

## マスタソース追加の流れ

機材マスタ DB が外部に立ったら:

1. `server/master/<your-source>.ts` を作って `MasterSource` を実装
2. `server/index.ts` の `CompositeMasterSource` 配列に追加
3. 既存の `LocalEquipmentSource` を残すか撤去するかは migration 戦略次第

## やらないこと

- ユーザ登録 UI (Cernere 側)
- 通知 (将来 Nuntius 経由で「返却催促」 を入れるかも、 v0.1 では無し)
- マスタの自前管理 (機材だけは暫定で持つが、 外部 DB ができたら撤去予定)

## テスト方針

- v0.1 は手動 (npm run dev → ブラウザでスキャン → 借りる → 別アカで返却)
- 後で vitest 入れて auth と routes/loans の最小ケースだけ書く
