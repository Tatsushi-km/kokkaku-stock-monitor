# kokkaku-stock-monitor

Googleスプレッドシートで作成した国策銘柄監視リストをCSVで読み込み、テーマ別・スコア別・ステータス別に確認できる静的Webアプリです。

## 構成

```text
kokkaku-stock-monitor/
├─ index.html
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

CSVの `score` または `status` が空欄の場合、Webアプリ側で自動計算します。CSVに値が入っている場合はCSV値を優先します。

score計算:

| 条件 | 点数 |
| --- | ---: |
| `change_pct` が 0 より大きい | +1 |
| `volume_ratio` が 1.5 以上 | +1 |
| `ma25_gap` が 0 より大きい | +1 |
| `ma75_gap` が 0 より大きい | +1 |
| `per` が空欄ではなく 60 未満 | +1 |
| `ma25_gap` が 15 以上 | -1 |
| `ma25_gap` が -10 以下 | -1 |

status判定:

| 条件 | status |
| --- | --- |
| `ma25_gap` が 15 以上 | 過熱注意 |
| `ma25_gap` が -10 以下 | 押し目待ち |
| `score` が 4 以上 | 監視強化 |
| `score` が 2 以上 | 条件待ち |
| `score` が 1 以下 | 調整中 |

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
| `current_price` | 最新営業日の終値 |
| `change_pct` | `(最新終値 - 前営業日終値) / 前営業日終値 * 100` |
| `volume` | 最新営業日の出来高 |
| `volume_ratio` | `最新出来高 / 20日平均出来高` |
| `ma25_gap` | `(最新終値 - 25日移動平均) / 25日移動平均 * 100` |
| `ma75_gap` | `(最新終値 - 75日移動平均) / 75日移動平均 * 100` |

`per`, `pbr`, `credit_ratio`, `next_earnings` は最初は空欄で出力します。

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

`JQUANTS_TO_DATE` が未設定の場合、スクリプトは今日ではなく安全側で約90日前を取得終了日にします。`JQUANTS_FROM_DATE` が未設定の場合、取得開始日は終了日から約180日前になります。

400エラー本文に取得可能期間が含まれている場合は、スクリプトが終了日をその上限日に補正して再試行します。

429エラーが出る場合は、銘柄ごとのリクエスト間隔を長くしてください。

```env
JQUANTS_REQUEST_SLEEP=3.0
```

429 Too Many Requests が返った場合、スクリプトは 5秒、15秒、30秒の指数バックオフで再試行します。それでも失敗した銘柄は空欄のままにして、次の銘柄へ進みます。

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

## GitHub Pages

このアプリは静的ファイルだけで動くため、GitHub Pagesで公開できます。

### GitHubへアップロード

1. GitHubで `kokkaku-stock-monitor` などの名前で新しいリポジトリを作成します。
2. このフォルダの中身をリポジトリ直下へ配置します。
3. `main` ブランチへコミットしてpushします。

アップロード対象の例:

```text
index.html
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
- score/statusのCSV値優先と空欄時の自動計算
- フィルター: `theme`, `priority`, `status`, `core`
- テーブル表示: `code`, `name`, `theme`, `priority`, `current_price`, `change_pct`, `volume_ratio`, `ma25_gap`, `ma75_gap`, `score`, `status`, `memo`
- scoreの高い順・低い順の並べ替え
- statusごとの色分け
- スマホ対応のレスポンシブデザイン
- daily_input用CSVテンプレート、サンプル、更新用ファイル、J-Quants取得ファイルの作成
