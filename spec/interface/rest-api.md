# REST API

Hono。全ルートは `requireAuth`（Cernere PASETO 検証）を通す。`requireAdmin` 付きは
`BIBLIOTHECA_ADMIN_IDS` に含まれる id のみ。マウントは
[`../../server/index.ts`](../../server/index.ts)。認証詳細は [`auth.md`](auth.md)。

## ヘルス / 自己情報
| Method | Path | 認可 | 動作 |
|---|---|---|---|
| GET | `/api/health` | — | ヘルス |
| GET | `/api/me` | auth | 認証ユーザの id / 表示名 / admin 判定 |

## items（`/api/items`）
| Method | Path | 認可 | 動作 |
|---|---|---|---|
| GET | `/lookup` | auth | ISBN / QR からアイテムメタ解決（OpenBD or equipment、キャッシュ経由） |
| GET | `/equipment` | auth | 機材マスタ一覧 |
| POST | `/equipment` | admin | 機材を 1 件登録 |
| POST | `/equipment/bulk` | admin | 機材を一括 upsert |
| POST | `/books/bulk` | admin | 書籍メタを一括取込 |

## loans（`/api/loans`）
| Method | Path | 認可 | 動作 |
|---|---|---|---|
| GET | `/open` | auth | 貸出中（未返却）一覧 |
| GET | `/mine` | auth | 自分の貸出履歴 |
| POST | `/` | auth | 貸出登録（本人が自分名義で） |
| POST | `/:id/return` | admin | 返却（admin 直接） |

## returns（`/api/returns`）— 返却ランデブー
| Method | Path | 認可 | 動作 |
|---|---|---|---|
| POST | `/token` | auth | 借主が短命の返却 token を発行 |
| POST | `/lookup` | admin | admin がスキャンした token の正当性検証（未消費・未失効） |
| POST | `/confirm` | admin | 返却確定（token 単回消費 + loan を返却済に） |

詳細フローは [`../feature/return.md`](../feature/return.md)。
