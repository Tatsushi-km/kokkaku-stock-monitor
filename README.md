# kokkaku-stock-monitor

Googleスプレッドシートで作成した国策銘柄監視リストをCSVで読み込み、テーマ別・スコア別・ステータス別に確認する静的Webアプリです。

## 構成

```text
kokkaku-stock-monitor/
├─ index.html
├─ data/
│  └─ stocks_master.csv
├─ scripts/
│  └─ create_daily_input_template.py
├─ web/
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
└─ README.md
```

## CSV

`data/stocks_master.csv` をGoogleスプレッドシートから書き出したCSVで置き換えてください。文字コードはUTF-8を想定しています。

必要な列は次の通りです。

```csv
code,name,theme,sub_theme,role,priority,core,memo,current_price,change_pct,volume,volume_ratio,ma25_gap,ma75_gap,per,pbr,credit_ratio,next_earnings,score,status,note
```

数値が空欄でも画面上は `-` として表示され、フィルターや並び替えでエラーにならないようにしています。

## Googleスプレッドシート公開CSV連携

Googleスプレッドシートを公開CSVとして読み込む場合は、`web/app.js` の先頭にある `CSV_URL` に公開CSV URLを設定してください。

```js
const CSV_URL = "";
```

例:

```js
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/公開ID/pub?gid=0&single=true&output=csv";
```

設定手順:

1. Googleスプレッドシートを開きます。
2. CSVとして公開できるURLを作成します。
3. URLの末尾が `output=csv` になることを確認します。
4. `web/app.js` の `CSV_URL` にURLを貼ります。
5. ブラウザでアプリを再読み込みします。

`CSV_URL` が空文字のままの場合は、従来通り `../data/stocks_master.csv` を読み込みます。GoogleスプレッドシートCSVの読み込みに失敗した場合も、ローカルCSVへ自動でフォールバックします。

CSV読み込み時はキャッシュ対策として、URL末尾に `t=現在時刻` を付けて取得します。画面上部の「データ確認」エリアで、読み込み元と読み込み時刻を確認できます。

## score/status 自動計算

CSVの `score` または `status` が空欄の場合は、アプリ側で自動計算します。CSVに値が入っている場合は、CSVの値を優先します。

scoreは次の条件で加減点します。

| 条件 | 点数 |
| --- | ---: |
| `change_pct` が 0 より大きい | +1 |
| `volume_ratio` が 1.5 以上 | +1 |
| `ma25_gap` が 0 より大きい | +1 |
| `ma75_gap` が 0 より大きい | +1 |
| `per` が空欄ではなく 60 未満 | +1 |
| `ma25_gap` が 15 以上 | -1 |
| `ma25_gap` が -10 以下 | -1 |

statusは次の順番で判定します。

| 条件 | status |
| --- | --- |
| `ma25_gap` が 15 以上 | 過熱注意 |
| `ma25_gap` が -10 以下 | 押し目待ち |
| `score` が 4 以上 | 監視強化 |
| `score` が 2 以上 | 条件待ち |
| `score` が 1 以下 | 調整中 |

自動計算された `score` と `status` は、サマリー、ランキング、フィルター、テーブル表示に反映されます。画面上部の「データ確認」エリアで、`score/status` の判定方式を確認できます。

## daily_inputテンプレート作成

`data/stocks_master.csv` の `code` と `name` から、Googleスプレッドシートの `daily_input` に貼り付けるためのCSVテンプレートを作成できます。

実行コマンド:

```bash
python scripts/create_daily_input_template.py
```

出力ファイル:

```text
data/daily_input_template.csv
```

出力列:

```csv
code,name,current_price,change_pct,volume,volume_ratio,ma25_gap,ma75_gap,per,pbr,credit_ratio,next_earnings
```

`current_price` 以降の列は空欄で出力されます。作成した `data/daily_input_template.csv` を開き、Googleスプレッドシートの `daily_input` シートへ貼り付けて、日々の株価・出来高・指標を入力してください。

## 使い方

ローカルで確認する場合は、`kokkaku-stock-monitor` フォルダを簡易Webサーバーで配信してください。

```bash
python -m http.server 8000
```

その後、ブラウザで次のURLを開きます。

```text
http://localhost:8000/web/
```

## GitHub Pages

このアプリは静的ファイルだけで動くため、GitHub Pagesでそのまま公開できます。現在の構成では、リポジトリ直下の `index.html` から `web/` に移動し、アプリ本体は `web/index.html` で表示します。

### GitHubへアップロードする手順

1. GitHubで `kokkaku-stock-monitor` などの名前で新しいリポジトリを作成します。
2. このフォルダの中身をリポジトリ直下に配置します。
3. 少なくとも次のファイルとフォルダをアップロードします。

```text
index.html
README.md
data/
web/
```

4. `main` ブランチへコミットしてpushします。

### Settings → Pages の設定方法

GitHubのリポジトリ画面で次のように設定します。

1. `Settings` を開きます。
2. 左メニューの `Pages` を開きます。
3. `Build and deployment` の `Source` を `Deploy from a branch` にします。
4. `Branch` を `main` にします。
5. `Folder` を選びます。
6. `Save` を押します。

### Folderを `/root` にする場合

現在の構成では `/root` が推奨です。`index.html`、`web/`、`data/` がリポジトリ直下にあるため、そのまま公開できます。

公開後のURL例:

```text
https://ユーザー名.github.io/kokkaku-stock-monitor/
```

アプリ本体を直接開く場合:

```text
https://ユーザー名.github.io/kokkaku-stock-monitor/web/
```

### Folderを `/docs` にする場合

GitHub Pagesの `Folder` を `/docs` にする場合は、公開対象が `docs/` 配下だけになります。そのため、次のように `docs/` の中へ公開用ファイルを配置してください。

```text
docs/
├─ index.html
├─ data/
│  └─ stocks_master.csv
└─ web/
   ├─ index.html
   ├─ style.css
   └─ app.js
```

この構成にした場合、`docs/web/index.html` から見て `../data/stocks_master.csv` が存在する必要があります。ローカルCSVフォールバックを使う場合は、`docs/data/stocks_master.csv` も忘れずに配置してください。

### `/web/` を開く必要がある場合

GitHub Pagesでリポジトリ直下を公開している場合、次のどちらでも開けます。

- `https://ユーザー名.github.io/kokkaku-stock-monitor/`
- `https://ユーザー名.github.io/kokkaku-stock-monitor/web/`

もしトップページでうまく表示されない場合は、直接 `/web/` を付けたURLを開いてください。

### Googleスプレッドシート公開CSVの運用

`web/app.js` の `CSV_URL` にGoogleスプレッドシートの公開CSV URLを設定している場合、GitHub Pages上でもGoogleスプレッドシートから直接CSVを読み込みます。

Googleスプレッドシート側を更新した後は、アプリ画面右上の更新ボタンを押してCSVを再読み込みしてください。読み込み元と読み込み時刻は、画面上部の「データ確認」エリアで確認できます。

GoogleスプレッドシートCSVが読み込めない場合は、ローカルCSVの `data/stocks_master.csv` にフォールバックします。公開CSVを使う場合でも、バックアップとして `data/stocks_master.csv` をGitHubへ置いておくと安心です。

### スマホ確認ポイント

スマホで公開URLを開いたら、次の点を確認してください。

- サマリーカードとデータ確認カードが縦に見やすく並ぶこと
- テーブルが横スクロールできること
- `memo` 列の文字が小さめに表示され、内容を追いやすいこと
- フィルター、scoreソート、更新ボタンが操作できること
- Googleスプレッドシート更新後に、更新ボタンで読み込み時刻が変わること

## 機能

- サマリーカード: 全銘柄数、監視強化、押し目待ち、過熱注意
- status別件数カード
- テーマ別の平均score
- score上位5銘柄
- 出来高倍率上位5銘柄
- Googleスプレッドシート公開CSVまたはローカルCSVの読み込み
- データ確認: 読み込み元、読み込み時刻、入力済み件数、CSVエラー表示
- score/statusのCSV値優先と空欄時の自動計算
- daily_input用CSVテンプレート作成
- フィルター: theme、priority、status、core
- テーブル表示: code、name、theme、priority、current_price、change_pct、volume_ratio、ma25_gap、ma75_gap、score、status、memo
- scoreの高い順・低い順の切り替え
- statusごとの色分け
- スマホ対応のレスポンシブデザイン
