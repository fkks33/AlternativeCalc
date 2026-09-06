# MonoPrompt

> **Terminal-style Formula Calculator with Material 3 Expressive Monochrome Design**  
> ターミナルのような数式直接入力・実行履歴の参照性と、電卓の手軽さ（テンキー、メモリ、スマート変数チップ）を融合させたWeb計算ツール。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20GitHub%20Pages-black.svg)

---

## 主な特徴

1. **ターミナル風の数式入力 ＆ リアルタイム計算プレビュー**
   - 括弧付きの長い式や小数が混ざる四則演算（例: `1122*(4.75+4570)+2500+2500`）をそのままタイピング可能。
   - 文法が成立した時点で、Enterを押す前に入力欄下に薄く `= 5,137,869.5` とリアルタイムプレビューが表示されます。
   - `eval()` や外部ライブラリを一切使わず、純粋な自作AST再帰下降パーサーにより安全かつ高速に評価。浮動小数点丸め誤差（`0.1 + 0.2 = 0.3`）も自動補正します。

2. **スマート変数機能 ＆ 電卓メモリ（M）の統合**
   - プロンプトに `tax = 0.1` や `rate = 155` と打ち込むだけで変数を即時登録。
   - 定義された変数は画面上部の**「変数チップ」**に値付きで並び、ワンタップで数式に挿入できます。
   - 電卓のメモリ機能（`MC`, `MR`, `M+`, `M-`）も変数 `M` と完全に連動。直前の計算結果を表す `ans` キーも備えています。

3. **実行ログ（履歴）の再利用性**
   - 計算を行うたびにターミナルのようにログカードが蓄積されます。
   - ログをタップすると、**「式を入力欄にセット」「結果をカーソル位置に挿入」「クリップボードにコピー」**のアクションシートが立ち上がります。
   - PCキーボード操作時は、ターミナル同様 `↑` / `↓` キーで過去の入力履歴を行き来できます。

4. **Material 3 Expressive × モノトーン デザイン**
   - 大きな角丸（Pill型ボタン、角丸カード）、心地よい触覚バウンスアニメーション（Haptic Feedback対応）。
   - 純黒・チャコールグレー・オフホワイトの高コントラストなモノトーンカラーシステム。
   - スマホの画面サイズに最適化されつつ、キーパッド折りたたみ（全画面ログ表示）にも対応。PCブラウザでも美しく動作します。

5. **LocalStorage による永続化 ＆ 外部依存ゼロ**
   - 履歴、登録変数、メモリ値は自動的にブラウザ内に保存されます。
   - ビルドステップ不要の純粋な HTML / CSS / JS 構成。

---

## 使い方・計算の例

### 1. 括弧と四則演算
```text
1122 * (4.75 + 4570) + 2500 + 2500
=> 5,137,869.5
```

### 2. 変数の定義と利用
```text
tax = 0.1
=> 0.1 (上部の変数バーに「tax: 0.1」チップが追加されます)

1000 * (1 + tax)
=> 1,100
```

### 3. 直前結果 `ans` を使った連続計算
```text
ans + 500
=> 1,600
```

### 4. べき乗と数学関数
```text
2 ^ 8
=> 256

sqrt(144) + 10
=> 22
```

---

## キーボードショートカット（PC操作時）

| キー | 動作 |
| :--- | :--- |
| `Enter` | 式または変数を実行・評価 |
| `↑` (Arrow Up) | 過去の入力履歴を遡る |
| `↓` (Arrow Down) | 履歴を進める / 現在の入力に戻る |
| `Esc` | 入力欄をクリア（モーダル表示中は閉じる） |

---

## GitHub Pages での公開手順

本リポジトリは静的ファイルのみで構成されているため、GitHub Pages で即座に公開できます。

1. **GitHub で新規リポジトリを作成**（例: `monoprompt` または `calculator`）。
2. このフォルダのファイルをコミットしてプッシュします：
   ```bash
   git init
   git add .
   git commit -m "Initial commit of MonoPrompt"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```
3. GitHub のリポジトリ画面で **Settings** > **Pages** を開きます。
4. **Build and deployment** の **Source** で `Deploy from a branch` を選択し、Branch を `main` / `/(root)` に設定して **Save** をクリックします。
5. 数分後、`https://<あなたのユーザー名>.github.io/<リポジトリ名>/` で公開されます。

---

## ライセンス
MIT License
