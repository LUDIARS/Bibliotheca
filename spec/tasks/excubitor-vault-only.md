---
task: excubitor-vault-only
source_session: lictor-32059a22-aa29-4ec0-98ef-5b30c18c6422
---
# Excubitor の catalog 登録と Vault-only 起動への移行

参照: actio:e10d589d-e4bd-4c12-aa70-df11692638d3

- [x] 前回の変更と既存の必須設定検証を確認し、同じ責務のモジュールへ集約する。
- [x] 既存の契約定義・述語を実装前に確認する。
- [x] `augur plan` に沿って設定検証と起動配線の回帰テストを用意する。
- [x] Infisical bootstrap、env-cli 設定・scripts、env-file オプションを撤去する。
- [x] サービス所有 catalog と Vault 前提の文書を整える。
- [ ] 契約注入と実測証跡取得: Anatomia の作業範囲外ログ書込みが EPERM。テスト実行は審査に委ねる。
- [ ] Concordia 経由でコミットし、Revisor local PR に提出する。

## 受け入れ条件

C-1 requireEnv(name, env): 注入された必須値を返し、未設定・空白値は変数名だけを示す例外で停止する

再利用: 従来の index.ts の必須値検証と前回作成済み required-env を統合する。
catalog は Aedilis / Ostiarius と Excubitor FRAGMENTS の構造を採用する。
資格情報取得は Excubitor に委ね、アプリに新たな Vault client は導入しない。

未確定: 現行公開 URL、Cernere の project 登録状態。旧ドメインは採用しない。
サービス起動、実データ操作、secret 値の閲覧、merge / push は対象外。
