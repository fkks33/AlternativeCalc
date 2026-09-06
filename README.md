# VarCalc

> **Reactive Variable & Terminal Formula Calculator with Material 3 Expressive Monochrome Design**  
> スプレッドシートのように連動する変数機能と、ターミナル風の計算履歴・枝分かれ（ブランチ）を備えたWeb計算ツール。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20GitHub%20Pages-black.svg)

---

## 主な特徴

1. **リアクティブな変数システム（連動再計算）**
   - `taxA = 1.1` → `taxB = taxA` と定義した後に `taxA = 1.08` に変更すると、依存関係がカスケード評価され、`taxB` も自動的に `1.08` に再計算されます。
   - 画面上部の「変数チップ」に現在値がリアルタイム表示され、ワンタップで式に挿入可能。

2. **計算ログからの「枝分かれ（ブランチ）」機能**
   - 過去の計算結果をタップして「🌿 ここから枝分かれ」を選ぶと、その時点の計算履歴と変数を引き継いだ新しいタブが自動生成されます。
   - A案・B案の比較検討や、異なる税率・パラメータでの試算がスムーズに行えます。

3. **ターミナル風ログ ＆ リアルタイム計算プレビュー**
   - 括弧付きの長い式や小数が混ざる計算（例: `1122*(4.75+4570)+2500+2500`）をそのままタイピング。
   - 入力途中に入力欄下に薄く `= 5,137,869.5` とリアルタイムプレビューが表示されます。
   - 安全な自作 AST 再帰下降パーサーにより `eval()` を一切使用せず、浮動小数点丸め誤差（`0.1 + 0.2 = 0.3`）も自動補正。

4. **スマートな括弧入力（自動補完）**
   - 行末で `(` を入力すると自動で `()` が入り、カーソルがかっこの間 `(|)` に移動します。途中への挿入時は邪魔にならないよう `(` のみ挿入されます。

5. **洗練された 5×5 キーパッド ＆ スマホ誤動作防止**
   - 不要な電卓メモリや ans キーを排し、テンキー・四則演算・履歴ナビゲーションに特化したクリーンな配置。
   - スマホで電卓キーを連打してもソフトウェアキーボードが画面を隠さない完全な誤ポップアップ防止設計。

6. **ライトテーマ / ダークテーマ自動対応**
   - 端末の OS 設定（`prefers-color-scheme`）に準拠した高コントラスト・モノトーンデザイン。

7. **完全静的・外部依存ゼロ**
   - ビルドステップ不要。GitHub Pages にプッシュするだけで即座に稼働します。

---

## 計算の例

### 1. 括弧と小数の四則演算
```text
1122 * (4.75 + 4570) + 2500 + 2500
=> 5,137,869.5
```

### 2. 変数の連動（リアクティブ）
```text
taxA = 1.1
=> 1.1

taxB = taxA
=> 1.1

taxA = 1.08
=> 1.08 （taxB も自動的に 1.08 に連動更新されます）

1000 * taxB
=> 1,080
```

---

## キーボードショートカット（PC操作時）

| キー | 動作 |
| :--- | :--- |
| `Enter` | 式または変数を実行・評価 |
| `↑` (Arrow Up) | 過去の入力式を遡る |
| `↓` (Arrow Down) | 次の式に進む / 現在の入力に戻る |
| `Esc` | 入力欄をクリア（モーダル表示中は閉じる） |

---

## GitHub Pages での公開手順

1. **GitHub でリポジトリを作成**（リポジトリ名: `VarCalc`）。
2. 本フォルダのファイルをプッシュします：
   ```bash
   git add .
   git commit -m "Deploy VarCalc"
   git remote add origin https://github.com/<あなたのユーザー名>/VarCalc.git
   git push -u origin main
   ```
3. GitHub リポジトリの **Settings** > **Pages** を開き、Source を `Deploy from a branch`、Branch を `main` / `/(root)` に設定して **Save**。
4. 数分後、`https://<あなたのユーザー名>.github.io/VarCalc/` でアクセス可能になります。

---

## ライセンス
MIT License
