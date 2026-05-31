# Bibliotheca 仕様書

本 / 機材の貸出台帳 **Bibliotheca**（略称 Bb）の仕様。AIFormat
[`FORMAT_SPEC.md`](https://github.com/LUDIARS/AIFormat/blob/main/FORMAT_SPEC.md)
の 6 分類に整理する。

Hono + better-sqlite3 + esbuild SPA + Cernere PASETO V4 SSO の単機能サービス。
個人データは Cernere 単一情報源で、Bibliotheca は `userId` + 表示名のみ保持する。

## 構成

```
spec/
├── data/        # SQLite スキーマ
├── feature/     # 機能概要（貸出/返却/閲覧/検索/マスタ）
├── interface/   # REST API + 認証
├── setup/       # 起動・env・3 モード
└── test/        # テスト設計
```

> `plan/` は未設置（ロードマップは README / CLAUDE）。

## feature 一覧
| ドキュメント | 概要 |
|---|---|
| [borrow.md](feature/borrow.md) | 本人による貸出登録 |
| [return.md](feature/return.md) | admin 返却 + 返却ランデブー（token）|
| [browse-and-history.md](feature/browse-and-history.md) | 貸出中一覧 + 自分の履歴 |
| [item-lookup.md](feature/item-lookup.md) | ISBN(OpenBD)/QR スキャン・メタ取得 |
| [equipment-master.md](feature/equipment-master.md) | 機材マスタ登録（admin・単/一括）|
| [book-import.md](feature/book-import.md) | 書籍の一括取込（admin）|
