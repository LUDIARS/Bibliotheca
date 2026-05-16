# Bibliotheca

LUDIARS の本 / 機材 貸出台帳。 Cernere SSO + カメラスキャン (ISBN / QR)。

短縮コード: **Bb**

## 機能

- **本**: カメラで ISBN-13 バーコードを読取り、 OpenBD から書誌を取得
- **機材**: カメラで QR コードを読取り、 ローカルマスタから機材情報を取得
- **貸出**: 本人が自分の名前で実施
- **返却**: **管理者のみ** が物理確認のうえ実施
- **一覧**: 貸出中一覧 / 自分の貸出履歴
- **個人データ**: Cernere 単一情報源、 Bibliotheca には userId のみ保持

## 構成

- 単一 Hono アプリ (`server/`) が REST API + 静的 SPA を提供
- 永続化は SQLite (`data/bibliotheca.db`、 better-sqlite3 / WAL)
- フロントエンドは esbuild + vanilla TypeScript + ZXing
- 認証は Cernere PASETO V4 (公開鍵 fetch)

### マスタソース抽象

書籍 / 機材の中身 (タイトル / 名前 / 仕様) は **Bibliotheca が直接保持しない**。
`server/master/source.ts` の `MasterSource` interface を介して差し替え可能:

| 実装 | 役割 | 状態 |
|------|------|------|
| `OpenBdSource` | 書籍 (ISBN → 書誌) | 標準実装、 API key 不要 |
| `LocalEquipmentSource` | 機材 (QR → 名前/仕様) | 暫定。 機材マスタ DB ができたら差替 |

機材マスタ DB が外部に立ったら、 新しい `MasterSource` 実装を 1 本書いて
`server/index.ts` の `CompositeMasterSource` に差し替える。

## 起動

```bash
cp .env.example .env
# .env を編集: BIBLIOTHECA_ADMIN_IDS にユーザ ID を列挙
npm install
npm run dev     # tsx watch + esbuild watch (frontend は predev で build)
```

デフォルト `http://localhost:17501` (loopback)。

## ポート

`17501` — LUDIARS port-map の loopback サービスレンジ (17000–17999)。
`infra/PORT-MAP.md` への登録は別 PR。

> 注: 当初 17500 を選んだが Windows では Dropbox LAN sync が `0.0.0.0:17500`
> を常に squat するため、 1 つずらして 17501 を採用した。

## ライセンス

リポジトリの LICENSE に準ずる。
