# GLAB の既存貸出 API への一度限りの委譲

`SPEC-BB-GLAB-SCOPED-DELEGATION-001`。親 actio:e0acdef1-32ef-40a8-bc38-be2250bed9cb、実装 actio:9d630f29-dfd4-43e0-b496-64e16f46844e。Cernere の公開71d6c368の標準 Composite backend SDK を MIT のまま固定して利用する。

利用者は GLAB 自身の opaque session を持つ。GLAB は利用者の最新のサービス session と対象データ ACL を検査してから、管理者の audience map と Cernere 正本に一致する target `bibliotheca` に対して委譲を取得する。Bibliotheca は自分の project credentials で Cernere の consume-delegation を呼び、source `glab`、target `bibliotheca`、利用者、現在の同意・失効状態、risk、requestId、action、完全な path/query、本文・意味を持つ header の digest が一致した一度限りの許可を検査する。サービス token 単体を利用者の権限に代用しない。

初回の local main075f は受理済み公開 main7b47 より古く、書籍2 API を未実装とした棚卸しは誤りだった。#3658 の審査前競合を契機に受理済み holdings/AWS setup/Cc署名機材取込を所有 feature へ取り込み、実在する7操作へ訂正した。本体 main は手動更新しない。署名取込以外の機材登録を復活させない。

## 有限操作

すべて `/api/integrations/glab` 以下。通常 PWA 用ルーターへ厳格な認証 middleware を注入して既存処理を再利用し、この namespace には旧 PASETO/Bearer/cookie fallback を置かない。未知 method/path、暗黙 HEAD、管理者用機材登録・他人の貸出台帳・返却操作は拒否する。`me` と `loans` の末尾 slash は同じ操作として扱う。

| Method/path | action | risk | 最新データ認可 |
| --- | --- | --- | --- |
| GET /items/equipment | equipment.list | read | 認可済み GLAB 利用者に共有機材情報のみ |
| GET /items/lookup | items.lookup | read | 認可済み GLAB 利用者に公開外部マスタのみ |
| GET /items/books | inventory.books.list | read | 登録済み共有 holdings のみ |
| POST /items/books | inventory.books.create | important | 現在ローカル admin 集合に含む本人のみ。OpenBD 確認と切断検査後に登録 |
| GET /me | identity.self.read | sensitive_read | Cr が検証した本人のみ、admin はローカル管理者集合で判定 |
| GET /loans/mine | loans.own.read | sensitive_read | 検証済み本人 ID で DB を絞る。query の他人 ID は使わない |
| POST /loans | loans.create | important | 借用者を検証済み本人から確定。現在のマスタ存在と貸出中行を実挿入直前に確認 |

POST 本文は64KiB、捕捉期限15秒。GET 本文は0bytes。parser より前に単一 reader で捕捉し、許可された同じ bytes を既存 handler へ replay する。超過・中断・期限・検証失敗では DB へ進まない。reader cancellation は同じ Promise を全経路で await し、timer/listener/reader lock を所有者が解放する。外部マスタ照会後の切断も挿入前に検査する。consume と DB は分散 transaction ではなく、消費後のアプリケーション障害を認証失敗に変えず、再試行しない。

## 設定と通信

起動前に CERNERE_BASE_URL、BIBLIOTHECA_PUBLIC_URL、CERNERE_PROJECT_CLIENT_ID、CERNERE_PROJECT_CLIENT_SECRET を必須検査する。資格情報は Excubitor の bibliotheca launch credentials が供給し、ソース・例外・ログへ出さない。SDK owner は server close/error で dispose する。SDK はリクエスト時の必要な Cr project 認証/consume のみ実施し、独自 telemetry・起動時 credential 送信・追加 npm dependency/install hook は無い。既存 PWA の公開鍵取得と OpenBD 書誌照会は従来経路の別通信として残る。

## 未完・切替条件

GLAB source caller のこの namespace/action/risk への変更、双方の管理者登録・操作宣言・現在同意、Corpus の明示 audience map、実運用確認を別単位で揃えるまで配備しない。旧 PWA の認証とその他 Bibliotheca API は未移行。同じ DB に旧経路が残るため Bibliotheca 全体・Cr 切替を完成扱いにしない。書籍 holdings は受理済み既存実装を使い、外部書誌を自前の在庫マスタに複製しない。

## 検証

実 SDK と Hono/SQLite を使う契約を test/glab-delegation.test.ts に記述。本文/header 改変、異なる source/target、失効・照会不能、並行再利用、旧資格情報、未知経路、自己貸出・二重貸出・切断後 DB 不実行を含む。session 自身は実行せず登録 Revisor へ委ねる。静的型成功、CI成功、設定適用、実運用確認は別証拠として記録する。
