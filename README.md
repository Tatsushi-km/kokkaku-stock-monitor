# kokkaku-stock-monitor

Googleスプレッドシートで作成した国策銘柄監視リストをCSVで読み込み、テーマ別・スコア別・ステータス別に確認できる静的Webアプリです。

## 構成

```text
kokkaku-stock-monitor/
├─ index.html
├─ update_jquants.bat
├─ data/
│  ├─ stocks_master.csv
│  ├─ daily_input_template.csv
│  ├─ daily_input_sample.csv
│  ├─ daily_input_update.csv
│  └─ daily_input_jquants.csv
├─ scripts/
│  ├─ create_daily_input_template.py
│  └─ fetch_jquants_daily_input.py
├─ web/
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
├─ .env.example
├─ .gitignore
├─ requirements.txt
└─ README.md
```

## Webアプリの使い方

ローカルで確認する場合は、`kokkaku-stock-monitor` フォルダで簡易Webサーバーを起動します。

```bash
python -m http.server 8000
```

Pythonコマンドが使えない場合は、Windowsの `py` でも起動できます。

```bash
py -m http.server 8000
```

ブラウザで次のURLを開きます。

```text
http://localhost:8000/web/
```

## CSV

Webアプリは `data/stocks_master.csv` またはGoogleスプレッドシート公開CSVを読み込みます。列順は次の通りです。

```csv
code,name,theme,sub_theme,role,priority,core,memo,current_price,change_pct,volume,volume_ratio,ma25_gap,ma75_gap,per,pbr,credit_ratio,next_earnings,score,status,note
```

数値が空欄の場合、画面上では `-` として表示されます。

## Googleスプレッドシート公開CSV連携

Googleスプレッドシートを公開CSVとして読み込む場合は、`web/app.js` の先頭にある `CSV_URL` に公開CSV URLを設定します。

```js
const CSV_URL = "";
```

例:

```js
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/公開ID/pub?gid=0&single=true&output=csv";
```

`CSV_URL` が空の場合は、従来通り `../data/stocks_master.csv` を読み込みます。GoogleスプレッドシートCSVの読み込みに失敗した場合も、ローカルCSVへフォールバックします。

Googleスプレッドシート側を更新した後は、アプリ画面右上の更新ボタンを押してCSVを再読み込みしてください。

## score/status 自動計算

Webアプリは、スイングトレード向けのルールで `score` と `status` を自動計算できます。

判定方式は `web/app.js` の上部にある `SCORE_STATUS_MODE` で切り替えます。

```js
const SCORE_STATUS_MODE = "auto";
```

- `"auto"`: CSVに `score` / `status` が入っていても、アプリ側で再計算します。
- `"csv"`: 従来通りCSV値を優先します。CSVの `score` / `status` が空欄の場合だけ、アプリ側で自動計算します。

画面上部のデータ確認エリアには、現在の判定方式として `CSV値` または `アプリ自動計算` が表示されます。

score計算:

| 条件 | 点数 |
| --- | ---: |
| `change_pct` が 0 より大きい | +1 |
| `volume_ratio` が 1.5 以上 | +1 |
| `volume_ratio` が 2.0 以上 | さらに +1 |
| `ma25_gap` が 0 より大きい | +1 |
| `ma75_gap` が 0 より大きい | +1 |
| `ma25_gap` が 0〜10 の範囲 | +1 |
| `ma75_gap` が 0〜20 の範囲 | +1 |
| `ma25_gap` が 15 以上 | -2 |
| `ma25_gap` が 25 以上 | さらに -1 |
| `ma25_gap` が -10 以下 | -1 |
| `ma75_gap` が -10 以下 | -1 |
| `volume_ratio` が 0.7 未満 | -1 |
| `change_pct` が -3 以下 | -1 |

scoreは最低 `0`、最高 `5` に丸めます。数値が空欄の項目は、加点・減点しません。

status判定:

| 優先順 | 条件 | status |
| ---: | --- | --- |
| 1 | `ma25_gap` が 25 以上 | 過熱注意 |
| 2 | `ma25_gap` が 15 以上 かつ `volume_ratio` が 2.0 以上 | 過熱注意 |
| 3 | `ma25_gap` が -10 以下 | 押し目待ち |
| 4 | `score` が 4 以上 | 監視強化 |
| 5 | `score` が 2〜3 | 条件待ち |
| 6 | `score` が 1 以下 | 調整中 |

自動計算した `score` と `status` は、サマリー、ランキング、フィルター、テーブルに反映されます。一部データが空欄でもエラーにはせず、取得できている項目だけで判定します。

この自動判定は監視を補助するための目安です。最終判断では、チャート、IR、決算予定、ニュース、出来高推移も個別に確認してください。

## 今日の注目銘柄

ダッシュボード上部のランキングエリアに、毎日まず確認するための `今日の注目銘柄` カードを表示します。

抽出条件:

- `score` が 4 以上
- `status` が `監視強化`
- `volume_ratio` が 1.5 以上
- `ma25_gap` が 0 以上 15 未満

並び順:

1. `score` が高い順
2. `volume_ratio` が高い順
3. `ma25_gap` が高すぎない順

最大5件を表示します。条件に合う銘柄がない場合は `該当なし` と表示します。

表示項目:

- `code`
- `name`
- `theme`
- `score`
- `volume_ratio`
- `ma25_gap`

このカードは売買推奨ではありません。チャート、IR、ニュース、出来高推移を確認するための候補リストとして使ってください。

## 押し目候補 / 深押し・要警戒

ダッシュボード上部のランキングエリアに、一時的に下げているが監視価値のある銘柄を確認するための `押し目候補` カードと、下落が深く通常の押し目とは分けて確認したい `深押し・要警戒` カードを表示します。

### 押し目候補

浅い押し目を探すためのカードです。

抽出条件:

- `current_price` が空欄ではない
- `ma25_gap` が -10 以上 0 未満
- `ma75_gap` が -20 より上
- `volume_ratio` が 0.8 以上

並び順:

1. `score` が高い順
2. `volume_ratio` が高い順
3. `ma25_gap` が0に近い順

### 深押し・要警戒

25日線や75日線から大きく崩れている銘柄を、通常の押し目候補とは分けて確認するためのカードです。

抽出条件:

- `current_price` が空欄ではない
- `ma25_gap` が -10 以下、または `ma75_gap` が -20 以下

並び順:

1. `ma25_gap` が低い順
2. `ma75_gap` が低い順

`ma25_gap` がちょうど -10 の銘柄は、重複表示を避けるため `深押し・要警戒` 側を優先します。

どちらのカードも最大5件を表示します。条件に合う銘柄がない場合は `該当なし` と表示します。

表示項目:

- `code`
- `name`
- `theme`
- `score`
- `出来高倍率`
- `25日乖離`
- `75日乖離`

どちらのカードも売買推奨ではありません。下落中の銘柄はさらに下がる可能性があります。必ずチャートで25日線、75日線、出来高、支持線を確認し、IRやニュースも見たうえで判断してください。

## 60銘柄へ増やす場合の注意点

監視対象を30銘柄から60銘柄へ増やす場合は、次を確認してください。

- `data/stocks_master.csv` に `code` と `name` を含む銘柄行を追加します。
- Googleスプレッドシート側の `stocks_master` と `daily_input` の列順を変えないでください。
- `scripts/create_daily_input_template.py` を実行し、`daily_input_template.csv` や `daily_input_update.csv` の行数を更新します。
- J-Quants更新時に429が出やすくなる場合は、`.env` の `JQUANTS_REQUEST_SLEEP` を大きくします。
- ダッシュボードのカードは最大5件表示なので、60銘柄に増えても上位候補だけを確認できます。
- テーブルは横スクロール前提です。スマホでは横スクロールできることを確認してください。
- 一部銘柄で `current_price`、`volume_ratio`、`ma25_gap` が空欄でも、取得データ不足であれば許容し、必要に応じて個別に確認してください。

## daily_input 用CSV作成

`data/stocks_master.csv` の `code` と `name` から、Googleスプレッドシートの `daily_input` に貼り付けるCSVを作成できます。

```bash
python scripts/create_daily_input_template.py
```

または:

```bash
py scripts/create_daily_input_template.py
```

作成されるファイル:

```text
data/daily_input_template.csv
data/daily_input_sample.csv
data/daily_input_update.csv
```

出力列:

```csv
code,name,current_price,change_pct,volume,volume_ratio,ma25_gap,ma75_gap,per,pbr,credit_ratio,next_earnings
```

`daily_input_template.csv` は初期テンプレートです。`code` と `name` だけが入り、`current_price` 以降は空欄です。

`daily_input_sample.csv` は動作確認用の仮データ入りCSVです。実データではありません。投資判断や日々の更新には使わないでください。

`daily_input_update.csv` は日々の更新用CSVです。`daily_input_template.csv` と同じ列順で、`current_price` 以降は空欄です。

Googleスプレッドシートへ貼り付けるときは、CSVを開いてヘッダー行を含めてコピーし、`daily_input` シートの `A1` セルに貼り付けます。

## J-Quants API V2で daily_input_jquants.csv を作成

`scripts/fetch_jquants_daily_input.py` は、`data/stocks_master.csv` の銘柄コードをもとにJ-Quants API V2から株価日足データを取得し、`data/daily_input_jquants.csv` を作成します。

J-Quants V2はAPIキー方式です。このスクリプトでは `JQUANTS_API_KEY` だけを使い、旧V1の `JQUANTS_MAILADDRESS`, `JQUANTS_PASSWORD`, `JQUANTS_ID_TOKEN`, `JQUANTS_REFRESH_TOKEN` は使いません。

取得・計算する列:

| 列 | 内容 |
| --- | --- |
| `current_price` | `price_date` 時点の終値 |
| `change_pct` | `price_date` の終値と、その直前取引日の終値から計算 |
| `volume` | `price_date` 時点の出来高 |
| `volume_ratio` | `最新出来高 / 20日平均出来高` |
| `ma25_gap` | `(最新終値 - 25日移動平均) / 25日移動平均 * 100` |
| `ma75_gap` | `(最新終値 - 75日移動平均) / 75日移動平均 * 100` |
| `price_date` | `current_price` に採用した終値の日付 |

`per`, `pbr`, `credit_ratio`, `next_earnings` は最初は空欄で出力します。

`current_price` はリアルタイム株価ではありません。J-Quants Light planで取得できる最新の日次データから、Closeが存在する最新取引日の終値を使います。日々の更新では、`daily_input_jquants.csv` の `price_date` を確認し、想定している取引日データか見てください。

J-Quants取得CSVの出力列:

```csv
code,name,current_price,change_pct,volume,volume_ratio,ma25_gap,ma75_gap,per,pbr,credit_ratio,next_earnings,price_date
```

Googleスプレッドシートの `daily_input` に取り込む場合は、最後の列に `price_date` を用意しておくと、株価データの日付を確認しやすくなります。

スクリプト実行時のログには、出力CSVのヘッダー、`price_date` の最小日付、`price_date` の最大日付、出力行数が表示されます。`current_price` が取得できなかった銘柄は、`price_date` も空欄のまま出力されます。

### 認証情報の設定

`.env.example` を `.env` にコピーし、自分のJ-Quants APIキーを設定します。

```bash
copy .env.example .env
```

macOS/Linuxの場合:

```bash
cp .env.example .env
```

`.env` には次のように設定します。

```env
JQUANTS_API_KEY=your_api_key_here
JQUANTS_FROM_DATE=
JQUANTS_TO_DATE=
JQUANTS_REQUEST_SLEEP=1.5
JQUANTS_FORCE_REFRESH=false
```

`.env` にはAPIキーが入るため、GitHubへアップロードしないでください。このリポジトリでは `.gitignore` で `.env` を除外しています。GitHubへ置くのは `.env.example` だけです。

### 取得期間とレート制限

J-Quantsの無料プランでは、取得可能な日付範囲に制限があります。取得可能期間を超えると、APIから `Your subscription covers the following dates: YYYY-MM-DD ~ YYYY-MM-DD` のような400エラーが返ることがあります。

取得終了日を固定したい場合は、`.env` に `JQUANTS_TO_DATE` を指定します。

```env
JQUANTS_TO_DATE=20260428
```

取得開始日を固定したい場合は、`.env` に `JQUANTS_FROM_DATE` も指定できます。

```env
JQUANTS_FROM_DATE=20241101
```

`JQUANTS_TO_DATE` が未設定または空欄の場合、スクリプトは今日ではなく安全側で約90日前を取得終了日にします。`JQUANTS_TO_DATE=auto` の場合は今日の日付を取得終了日にします。

`JQUANTS_FROM_DATE` が未設定、空欄、または `auto` の場合、取得開始日は取得終了日から約180日前になります。

```env
JQUANTS_TO_DATE=auto
JQUANTS_FROM_DATE=auto
```

400エラー本文に取得可能期間が含まれている場合は、スクリプトが終了日をその上限日に補正して再試行します。

429エラーが出る場合は、銘柄ごとのリクエスト間隔を長くしてください。

```env
JQUANTS_REQUEST_SLEEP=3.0
```

429 Too Many Requests が返った場合、スクリプトは 5秒、15秒、30秒の指数バックオフで再試行します。それでも失敗した銘柄は空欄のままにして、次の銘柄へ進みます。

古いキャッシュを使わずに再取得したい場合は、`.env` に次を設定します。

```env
JQUANTS_FORCE_REFRESH=true
```

### 実行方法

初回だけ、J-Quants公式Pythonクライアントをインストールします。

```bash
py -m pip install -r requirements.txt
```

または:

```bash
python -m pip install -r requirements.txt
```

```bash
py scripts\fetch_jquants_daily_input.py
```

または:

```bash
python scripts/fetch_jquants_daily_input.py
```

出力先:

```text
data/daily_input_jquants.csv
```

`JQUANTS_API_KEY` が未設定の場合は、分かりやすいエラーメッセージを表示し、`code` と `name` だけ入った空欄CSVを作成します。

銘柄単位で取得エラーが起きた場合、処理全体は止めません。該当銘柄の行は `code` と `name` を残して市場データ列を空欄にし、エラーログを表示します。

作成されたCSVは、Googleスプレッドシートの `daily_input` シートで `A1` セルから貼り付けてください。

### update_jquants.bat でワンクリック更新

Windowsでは、リポジトリ直下の `update_jquants.bat` をダブルクリックすると、J-Quantsデータ更新を実行できます。

事前準備:

1. `.env.example` を `.env` にコピーします。
2. `.env` の `JQUANTS_API_KEY` に自分のAPIキーを設定します。
3. 初回だけ、次のコマンドでJ-Quants公式Pythonクライアントをインストールします。

```bash
py -m pip install -r requirements.txt
```

使い方:

1. `update_jquants.bat` をダブルクリックします。
2. 「J-Quantsデータ更新を開始します」と表示されます。
3. `py` コマンドで `scripts\fetch_jquants_daily_input.py` を実行します。
4. `py` が使えない場合は `python` コマンドで実行します。
5. 実行後、成功・失敗と `data\daily_input_jquants.csv` の生成確認が表示されます。
6. 必要に応じて、最後の確認で `Y` を押すと `data` フォルダをエクスプローラーで開けます。
7. 画面はすぐ閉じず、最後に `pause` で停止します。

更新後は、`data\daily_input_jquants.csv` を開き、ヘッダー行を含めてGoogleスプレッドシートの `daily_input` シートの `A1` セルに貼り付けます。その後、GitHub Pagesアプリ側では画面右上の更新ボタンを押してCSVを再読み込みしてください。

`.env` にはJ-Quants APIキーが入るため、絶対にGitHubへアップロードしないでください。GitHubへ置くのは `.env.example` だけです。

### 毎日のJ-Quantsデータ更新手順

毎日の運用では、次の順番で更新します。

1. `update_jquants.bat` をダブルクリックします。
2. J-Quantsから株価日足データを取得します。
3. `data\daily_input_jquants.csv` が作成・更新され、`price_date` が入っていることを確認します。
4. Googleスプレッドシートを開きます。
5. `daily_input` シートを開きます。
6. `data\daily_input_jquants.csv` をインポート、または内容を貼り付けます。
7. `stocks_master` に `daily_input` の内容が反映されているか確認します。
8. GitHub Pagesで公開しているアプリを開きます。
9. 画面右上の更新ボタンを押します。
10. dashboardでサマリー、ランキング、status別件数を確認します。

### Googleスプレッドシートへの反映方法

推奨は、Googleスプレッドシートのインポート機能を使う方法です。

1. Googleスプレッドシートで `daily_input` シートを開きます。
2. メニューから `ファイル → インポート → アップロード` を選びます。
3. `data\daily_input_jquants.csv` をアップロードします。
4. インポート場所は `現在のシートを置換` を選びます。
5. 区切り文字は `カンマ` を選びます。
6. インポート後、`daily_input` の `A1` からヘッダーと各銘柄データが正しく入っていることを確認します。

貼り付けで反映する場合は、`data\daily_input_jquants.csv` を開き、ヘッダー行を含めて全体をコピーして、`daily_input` シートの `A1` セルから貼り付けます。

### 更新後の確認ポイント

- `stocks_master` の `current_price` が監視対象件数分入っているか確認します。
- `daily_input_jquants.csv` の `price_date` が入っているか確認します。
- `current_price` は `price_date` 時点の終値であり、リアルタイム株価ではない点を確認します。
- `volume_ratio` が入っているか確認します。
- `score` と `status` が更新されているか確認します。
- QPS研究所など一部銘柄が空欄でも、J-Quants側の取得データ不足が原因であれば許容します。
- GitHub Pagesアプリのdashboardで、score上位、出来高倍率上位、status別件数を確認します。

### J-Quants更新のトラブル対応

- `429 Too Many Requests` が出た場合は、15〜30分待ってから再実行します。
- 取得が重い、または429が続く場合は、`.env` の `JQUANTS_REQUEST_SLEEP` を大きくします。
- 例: `JQUANTS_REQUEST_SLEEP=3.0` または `JQUANTS_REQUEST_SLEEP=5.0`
- 一部銘柄が空欄の場合は、まず `data\daily_input_jquants.csv` 側で該当銘柄の行を確認します。
- `daily_input_jquants.csv` が空欄でも、スクリプト画面にエラー内容が表示されている場合は、その内容を確認します。
- `.env` にはJ-Quants APIキーが入るため、絶対にGitHubへアップロードしないでください。

### 推奨運用

- 1日1回、朝または夜に更新します。
- 更新後はdashboardの `score上位`、`出来高倍率上位`、`status別件数` を確認します。
- 自動判定だけで判断せず、気になる銘柄はチャートや出来高推移を個別に確認します。
- Googleスプレッドシート側を更新した後は、GitHub Pagesアプリの右上の更新ボタンを押して最新CSVを読み込みます。

## 確認リンク

銘柄テーブルの `確認リンク` 列には、4桁の銘柄コードが入っている行だけ外部サイトへのリンクボタンを表示します。
PCでは `Yahoo`、`株探`、`TV`、`TDnet` を小さなボタンとして横並びで表示し、スマホではボタン単位で折り返します。
リンクは `external-links` 内の `external-link-button` として描画し、`株探` や `TDnet` が1文字ずつ分割されないようにしています。

表示するリンク:

- `Yahoo`: Yahoo!ファイナンス
- `株探`: 株探チャート
- `TV`: TradingView
- `TDnet`: TDnet 適時開示情報閲覧サービス

リンク先:

```text
Yahoo!ファイナンス: https://finance.yahoo.co.jp/quote/{code}.T
株探: https://kabutan.jp/stock/chart?code={code}
TradingView: https://jp.tradingview.com/symbols/TSE-{code}/
TDnet: https://www.release.tdnet.info/inbs/I_main_00.html
```

すべて別タブで開きます。外部サイトの株価、チャート、ニュース、適時開示をアプリが自動取得する機能ではありません。ユーザーがクリックして確認作業を効率化するためのリンクです。

## GitHub Pages

このアプリは静的ファイルだけで動くため、GitHub Pagesで公開できます。

### GitHubへアップロード

1. GitHubで `kokkaku-stock-monitor` などの名前で新しいリポジトリを作成します。
2. このフォルダの中身をリポジトリ直下へ配置します。
3. `main` ブランチへコミットしてpushします。

アップロード対象の例:

```text
index.html
update_jquants.bat
README.md
data/
scripts/
web/
.env.example
.gitignore
requirements.txt
```

`.env` はアップロードしないでください。

### Settings → Pages の設定

1. GitHubのリポジトリ画面で `Settings` を開きます。
2. 左メニューの `Pages` を開きます。
3. `Build and deployment` の `Source` を `Deploy from a branch` にします。
4. `Branch` を `main` にします。
5. `Folder` を選びます。
6. `Save` を押します。

### Folderを `/root` にする場合

現在の構成では `/root` が推奨です。公開後のURL例:

```text
https://ユーザー名.github.io/kokkaku-stock-monitor/
```

アプリ本体を直接開く場合:

```text
https://ユーザー名.github.io/kokkaku-stock-monitor/web/
```

トップページでうまく表示されない場合は、直接 `/web/` を付けたURLを開いてください。

### Folderを `/docs` にする場合

GitHub Pagesの `Folder` を `/docs` にする場合は、公開対象ファイルを `docs/` 配下へ配置する必要があります。ローカルCSVフォールバックを使う場合は、`docs/web/index.html` から見て `../data/stocks_master.csv` が存在するように `docs/data/stocks_master.csv` も配置してください。

### スマホ確認ポイント

スマホで公開URLを開いたら、次を確認してください。

- サマリーカードとデータ確認カードが縦に見やすく並ぶこと
- テーブルが横スクロールできること
- `memo` 列が小さめの文字で表示され、内容を追いやすいこと
- フィルター、scoreソート、更新ボタンが操作できること
- Googleスプレッドシート更新後に、更新ボタンで読み込み時刻が変わること

## 機能

- サマリーカード
- データ確認カード
- status別件数カード
- テーマ別平均score
- score上位5銘柄
- 出来高倍率上位5銘柄
- Googleスプレッドシート公開CSVまたはローカルCSVの読み込み
- CSV読み込み元と読み込み時刻の表示
- score/statusのCSV値優先モードとアプリ自動計算モード
- フィルター: `theme`, `priority`, `status`, `core`
- テーブル表示: `code`, `name`, `theme`, `priority`, `current_price`, `change_pct`, `volume_ratio`, `ma25_gap`, `ma75_gap`, `score`, `status`, `memo`, `確認リンク`
- 銘柄確認リンク: `Yahoo`, `株探`, `TV`, `TDnet`
- scoreの高い順・低い順の並べ替え
- statusごとの色分け
- スマホ対応のレスポンシブデザイン
- daily_input用CSVテンプレート、サンプル、更新用ファイル、J-Quants取得ファイルの作成
