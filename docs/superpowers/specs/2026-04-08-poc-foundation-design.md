# BalloonShoot PoC Foundation Design

作成日: 2026-04-08

## 位置づけ

この文書は `BalloonShoot` の PoC 実装に入る前に、初期技術スタック、フォルダ構造、品質ゲート、作業文書の置き方を確定するための設計書である。

この PoC は完成版ゲームではない。最優先は、放課後等デイサービス向けに「子どもの小さい手でも、ノートPCの Web カメラだけで、狙って撃つ体験が成立するか」を短期間で検証することである。

## ゴール

- Chrome 上で動くローカル完結の PoC を実装できる状態にする
- 手追跡、入力補正、ゲームループ、描画、音、デバッグ調整を分離した構成を採用する
- PoC 成立後に `Phaser` 系のゲーム実装へ移行可能な境界を最初から確保する
- `AGENTS.md` / `CLAUDE.md` の近接配置で、作業場所ごとの文脈を stateless に管理できるようにする
- fail-fast / YAGNI / DRY / TDD を機械的な設定とモジュール境界で支える

## 対象範囲

この設計書の対象は以下に限る。

- 初期技術スタック
- ディレクトリ構造
- モジュール境界
- `AGENTS.md` / `CLAUDE.md` の配置方針
- lint / typecheck / test の品質ゲート
- PoC における仕様前提

以下はこの段階では対象外とする。

- 実装コードの scaffold
- 具体的な UI デザイン作成
- Phaser 版の実装
- 本番用のアセット制作

## PoC の仕様前提

PoC では以下を固定前提とする。

- 対象ブラウザは Chrome
- 画面遷移は `カメラ許可 -> スタート -> カウントダウン -> プレイ -> 結果 -> リトライ`
- プレイ時間は 1 分
- 開始時に `3, 2, 1, start!` のカウントダウンを表示する
- 画面下からカラフルな風船が上昇する
- クロスヘアは手の指先に追従する
- 射撃時にエフェクトを表示する
- 通常風船は 1 点、小型風船は 3 点
- 連続命中で倍率を上げる
- ミス時は減点せず、コンボだけ切る
- 射撃音、命中音、BGM、タイムオーバー音、結果表示時の祝福 SE を入れる
- PoC ではカメラ映像をプレイ中に背景表示し、認識状態を確認しやすくする
- PoC には調整 UI とデバッグ表示を入れる

## 技術スタック方針

### 採用方針

PoC は `Vanilla TypeScript + Canvas 2D` を採用する。

ただし、単純な一枚アプリとして作るのではなく、将来 `Phaser` へ移行しやすいよう、ゲームの本質部分を描画や DOM から分離する。

### 採用スタック

- Bundler / Dev Server: `Vite`
- Language: `TypeScript`
- Hand Tracking: `MediaPipe Hand Landmarker`
- Rendering: `Canvas 2D`
- UI Shell: 軽量な `HTML overlay`
- Audio: ブラウザ標準オーディオ API ベースの軽量管理
- Unit / Integration Test: `Vitest`
- Browser E2E: `Playwright`
- Lint: `ESLint` with type-aware rules
- Format: `Prettier`

### 採用しないもの

- PoC の時点では `React` を入れない
- PoC の時点では `Phaser` を入れない
- 物体認識モデルは導入しない
- 外部サーバー、保存機能、認証機能は導入しない

## 技術判断の理由

### なぜ Vanilla TS + Canvas 2D なのか

- PoC の難所はゲームエンジンではなく、手追跡と入力補正である
- webcam、MediaPipe、Canvas overlay、デバッグ表示を最短で接続できる
- ランタイムと依存を軽く保てる
- 子どもの手のサイズ差や照明差に対する調整サイクルを速く回せる

### なぜ将来 Phaser へ移行可能にしておくのか

- PoC が成立した場合、演出、シーン管理、アセット運用を強化した独立ゲームへ発展させる余地がある
- その時に `hand tracking / input mapping / gameplay` を流用できると、再実装コストを減らせる
- ただし PoC の段階では、Phaser 導入コストが先に立つため見送る

## 認識と入力の設計方針

### Hand Landmarker の扱い

認識スタックは `MediaPipe Hand Landmarker` を前提とする。

PoC では以下をランドマークから算出する。

- クロスヘア追従: 人差し指先端
- 発射候補: 親指の位置変化
- 銃型ポーズ判定: ゆるい姿勢条件

`銃型` を独立の物体認識対象として扱うのではなく、手のランドマークから規則ベースで判定する。

### 小さい手への配慮

放デイの子どもは手が小さい前提で、認識の吸収は追加モデルではなく入力正規化で行う。

- 距離判定は絶対値ではなく手の基準長で正規化する
- 発射は押下閾値と解放閾値を分ける
- 照準位置には平滑化を入れる
- 一瞬の見失いでは即座に状態破棄しない
- 銃型判定は厳密一致ではなく、ゆるい姿勢条件で始める

## 難易度設計の前提

- 風船の基本サイズは大きめ
- 時間経過で小型風船が出る
- 時間経過で上昇速度を上げる
- 時間経過で出現量を増やす

PoC では「最初は遊びやすく、後半で少し忙しくなる」流れを基準とする。

## フォルダ構造

初期構成は以下を想定する。

```text
BalloonShoot/
├─ src/
│  ├─ app/
│  │  ├─ bootstrap/
│  │  ├─ screens/
│  │  └─ state/
│  ├─ features/
│  │  ├─ camera/
│  │  ├─ hand-tracking/
│  │  ├─ input-mapping/
│  │  ├─ gameplay/
│  │  ├─ rendering/
│  │  ├─ audio/
│  │  └─ debug/
│  ├─ shared/
│  │  ├─ math/
│  │  ├─ browser/
│  │  ├─ config/
│  │  └─ types/
│  ├─ assets/
│  │  ├─ audio/
│  │  └─ images/
│  ├─ styles/
│  └─ main.ts
├─ public/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ docs/
```

## モジュール責務

### `src/app/`

アプリ起動、画面遷移、画面状態の保持を担当する。

- カメラ許可
- スタート
- カウントダウン
- プレイ開始
- 結果表示
- リトライ

### `src/features/camera/`

ブラウザのカメラ取得と video 要素のライフサイクルを扱う。

### `src/features/hand-tracking/`

MediaPipe の初期化、推論実行、ランドマーク取得を担当する。

### `src/features/input-mapping/`

ランドマークをゲーム入力へ変換する。

- 指先座標からクロスヘア位置を算出する
- 平滑化を適用する
- 銃型ポーズの成立を判定する
- 親指動作から発射イベントを作る
- 見失い時の復帰条件を扱う

### `src/features/gameplay/`

ゲームルールを担当する。

- 風船生成
- 難易度上昇
- 当たり判定
- スコア
- コンボ
- 倍率
- 制限時間

### `src/features/rendering/`

Canvas 2D による描画のみを担当する。ゲームルールや手認識の判定は持たない。

### `src/features/audio/`

BGM と SE のロードおよび再生制御を担当する。

### `src/features/debug/`

調整 UI とデバッグ表示を担当する。

- 閾値調整
- 平滑化設定
- ランドマーク可視化
- 発射判定状態の表示

### `src/shared/`

純粋関数、型、定数、ブラウザ依存の薄い共通処理を置く。

## 将来の Phaser 移行方針

PoC の時点で以下は `Phaser` 非依存に保つ。

- hand tracking
- input mapping
- gameplay
- hit detection
- audio trigger interface

`Phaser` 移行時は主に以下を差し替える。

- rendering
- scene presentation
- asset loading
- UI presentation

この境界を守ることで、PoC の知見を活かしたままゲームらしい見た目へ移行できる。

## AGENTS.md / CLAUDE.md の構成方針

### 基本方針

- ルート `AGENTS.md` は repo 全体に共通する事実だけを書く
- 作業場所ごとの具体的な文脈は、そのディレクトリに置く scoped `AGENTS.md` に寄せる
- すべての `AGENTS.md` と同階層に `CLAUDE.md` の symlink を置き、同一内容を参照させる
- 内容は stateless に保ち、時期依存の TODO や個人メモは入れない
- OpenAI / Anthropic のベストプラクティスに沿って `WHY / WHAT / HOW` と progressive disclosure を採用する
- lint や style guide の細則は `AGENTS.md` に書かず、設定ファイルとコマンドに委ねる

### 初期配置

```text
/
├─ AGENTS.md
├─ CLAUDE.md -> AGENTS.md
├─ src/
│  ├─ AGENTS.md
│  ├─ CLAUDE.md -> AGENTS.md
│  ├─ app/
│  │  ├─ AGENTS.md
│  │  └─ CLAUDE.md -> AGENTS.md
│  ├─ features/
│  │  ├─ AGENTS.md
│  │  └─ CLAUDE.md -> AGENTS.md
│  └─ shared/
│     ├─ AGENTS.md
│     └─ CLAUDE.md -> AGENTS.md
├─ tests/
│  ├─ AGENTS.md
│  └─ CLAUDE.md -> AGENTS.md
└─ docs/
   ├─ AGENTS.md
   └─ CLAUDE.md -> AGENTS.md
```

必要に応じて `src/features/hand-tracking/` のような下位ディレクトリにさらに scoped `AGENTS.md` を増やす。

## 品質ゲート

### 開発原則

このプロジェクトの初期実装では、以下を原則とする。

- fail-fast
- YAGNI
- DRY
- TDD

### fail-fast

- 回復不能な異常を雑な fallback で隠さない
- `try-catch` は外部境界か回復戦略を持つ箇所に限定する
- `catch` して握りつぶす実装を避ける

### YAGNI

- Chrome 単独、1 人、片手、1 モードに絞る
- 将来拡張のための過剰抽象化を避ける

### DRY

- 距離正規化、平滑化、閾値判定、難易度計算などのロジックは共有可能な単位に切り出す
- ただし、重複除去を目的に初期理解を損なう抽象化は行わない

### TDD

先に純ロジックを固める。

優先テスト対象:

- 発射判定
- クロスヘア平滑化
- スコア倍率
- コンボ切れ条件
- 難易度上昇
- 命中判定

## Lint / Typecheck 方針

### TypeScript

以下の strict 系設定を有効化する。

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`
- `noPropertyAccessFromIndexSignature`

### ESLint

型付き lint を前提とし、少なくとも以下を厳格に扱う。

- `any` の濫用
- 浮いた Promise
- 雑な truthy / falsy 判定
- 不要な条件分岐
- import cycle
- 責務越境
- 認知的複雑性の上昇

導入候補:

- `typescript-eslint`
- `eslint-plugin-import`
- `eslint-plugin-boundaries`
- `eslint-plugin-sonarjs`

### Prettier

コード整形は `Prettier` で一元化する。

### Git Hook / CI 相当

- pre-commit で軽量な検査を行う
- `lint`
- `typecheck`
- `test`

各コマンドは個別に実行可能な形で用意する。

## AI Slop を防ぐ具体方針

以下を機械的に通しにくくする。

- 不要な `try-catch`
- 根拠の薄い fallback
- `null` / `undefined` の安易な拡散
- `any` の持ち込み
- 巨大ファイル化
- 循環依存
- 複雑すぎる条件分岐
- 使われない export
- 責務の曖昧な util 化

実装時の判断基準:

- 状態は可能なら `discriminated union` で表現する
- 不明値は `unknown` から絞り込む
- 失敗は隠さず明示的に壊す
- fallback は正常系として説明できる場合に限る

## PoC 成功判定の考え方

PoC の第一目標は、見た目を完成させることではなく、以下を成立させることである。

- 60 秒のプレイが通る
- 子どもの小さい手でもクロスヘア追従が概ね成立する
- 誤発射が過度に多くない
- 狙って撃つ体験がゲームとして成立する
- デバッグ調整で現場差を吸収できる見込みがある

これが成立した後に、`Phaser` を含むゲーム化の判断へ進む。

## 実装開始時の優先順

1. `hand-tracking` の安定した取得
2. `input-mapping` の正規化と発射判定
3. `gameplay` の最小ループ
4. `rendering` と UI 接続
5. `audio`
6. `debug` 調整 UI
7. `AGENTS.md` / `CLAUDE.md` 階層整備

## 次のステップ

この設計を元に、実装のための詳細 plan を別文書に切り出す。
