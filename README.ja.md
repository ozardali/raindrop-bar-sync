# Raindrop Bar Sync

**ブラウザのブックマークバーを、Raindrop.io を通じてすべてのブラウザで同じ状態に。**

[English](README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · **日本語** · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (BR)](README.pt-BR.md)

Chrome、Edge、Brave、Vivaldi、Helium、Firefox の**標準のブックマークバー**を、Raindrop.io の
1 つのコレクションと双方向に同期するブラウザ拡張機能です。Firefox でブックマークを追加すると、
1 分後には Chrome のバーの同じフォルダ・同じ位置に表示されます。サーバーには Raindrop を使うので、
ほかに用意するものはありません。

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="ツールバーのポップアップ">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="ツールバーのポップアップ（ダークテーマ）">
</p>

## なぜ作ったか

- Chrome Sync と Firefox Sync は、それぞれ同じ系統のブラウザ間でしか同期しません。
- Raindrop 公式の拡張機能はブックマークを Raindrop に保存しますが、ブラウザのバーには触れません。
- ブラウザをまたいでブックマークを同期するツールには、自分で用意する保存先（Nextcloud、WebDAV、
  Google Drive など）が必要です。すでに Raindrop を使っているなら、それを保存先にできます。

## 機能

- ブックマークバーとそのサブフォルダの**双方向同期**: どちら側でも追加・名前変更・リンク編集・
  移動・削除ができます。
- フォルダとブックマークが混在する並びまで含めた**正確な順序**。Raindrop 自体はこれを保存できないため、
  コレクション内の小さな非表示メモに保持します。
- **最後の変更が優先**: ブックマークごと・項目ごとに、実際に変更した時刻で判断します。ブラウザが何日も
  オフラインだった場合でも同様です。
- **うっかり消えることはありません**: 最初の同期は追加のみ。一方で削除されたフォルダに他方で何かが
  追加されていればフォルダは復元され、大量の削除は一時停止して確認を求めます。
- 変更のたびにこのブラウザのバーを**バックアップ**し、ワンクリックで復元できます。
- すべての変更とその出どころ（「Firefox から」）を記録する**アクティビティログ**。
- コレクションと同期しているすべてのブラウザの**デバイス一覧**。
- **オフラインでも安心**: 接続がない間の変更は保持され、接続が戻ると送信されます。
- ポップアップと設定は **16 言語**、ライト／ダークテーマに対応。
- サーバーなし、アナリティクスなし。権限は `bookmarks`、`storage`、`alarms`、`api.raindrop.io` のみ。

![設定ページ](docs/images/options.png)

## インストール

まだ Chrome ウェブストアや addons.mozilla.org では公開していないので、ソースからビルドしてください。
[Node.js](https://nodejs.org) 20 以上が必要です。

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Chromium 系ブラウザ**: `chrome://extensions` を開いて**デベロッパー モード**をオンにし、
**パッケージ化されていない拡張機能を読み込む**から `.output/chrome-mv3` を選びます。

**Firefox**: `about:debugging#/runtime/this-firefox` を開き、**一時的なアドオンを読み込む…**から
`.output/firefox-mv3/manifest.json` を選びます。一時的なアドオンは Firefox の終了時に削除されます。
常用するには `npm run zip:firefox` を実行し、zip を
[addons.mozilla.org](https://addons.mozilla.org/developers/) で非公開（unlisted）アドオンとして
署名してください。

## 設定

1. **まずブックマークをバックアップ**してください（ブックマーク マネージャ → エクスポート）。
   同期は実際のデータを書き換えます。
2. この拡張機能を使うブラウザでは、ブラウザ内蔵のブックマーク同期（Chrome Sync / Firefox Sync）を
   オフにします。1 つのバーに 2 つの同期が動くと競合して重複が生まれます。
3. 拡張機能のアイコン → **設定**をクリックします。
4. **Raindrop アカウント**: テストトークンを貼り付けます。取得方法はページが順を追って案内します:
   Raindrop → 設定 → 統合 → *新しいアプリを作成* → *テストトークンを作成*。トークンで操作できるのは
   ご自身のアカウントだけで、期限切れになりません。
5. **コレクション**: バーを反映するコレクションを選ぶか、新しく作成します。**すべてのブラウザで同じ
   コレクション**を使ってください。
6. これで完了です。最初の同期は両側をまとめます。足りないものを双方向に追加し、何も削除しません。

以後、ブラウザでの変更は数秒で Raindrop に送られ、他のブラウザからの変更は 1 分以内（変更可能）に
届きます。

## 仕組み

同期のたびに 3 つのツリーを比較します。今のバー、今のコレクション、そして前回の同期で両側が一致した
状態です。片側だけで変わったものはもう片側にコピーし、両側で同じものが変わっていれば新しいほうが
優先されます。マージ処理はユニットテスト・プロパティテスト・ファジングテスト付きの純粋関数で、
何百ものランダムな編集履歴について、両側が一致し新しいものが失われないことを確認しています。

詳細: [docs/architecture.md](docs/architecture.md)。設計が前提とする Raindrop API の挙動
（実際の API で検証済み）: [docs/raindrop-api.md](docs/raindrop-api.md)（英語）。

## 制限事項

- 同期するのはブックマークバー（とそのフォルダ）だけで、「その他のブックマーク」や「モバイル」は
  対象外です。
- 区切り線（Firefox）は同期しません。Raindrop に対応するものがありません。
- Raindrop が受け付けないリンク（`javascript:` ブックマークレット、`file:`、`about:`）は元の
  ブラウザに残り、削除されることはありません。
- Android 版 Firefox と Safari には対応していません。
- Vivaldi と Brave は Chrome と同様に動くはずですが、まだ検証していません。
- ログインはテストトークンで行います。「Raindrop でログイン」（OAuth）はサーバー側の秘密鍵が
  必要なため実装していません。

## 免責事項

**これは非公式のプロジェクトであり、Raindrop.io とは提携しておらず、承認も受けていません。**

**同期は 2 か所の実データを書き換えます。** 安全策（最初の同期で削除しない、大量削除の一時停止、
ローカルバックアップ、Raindrop のゴミ箱）によってブックマークを失う可能性は低くなりますが、
ゼロにはなりません。戻せるブックマークのエクスポートを保管しておいてください。

**無保証です。** 本ソフトウェアは [MIT ライセンス](LICENSE)のもと現状のまま提供されます。

## プライバシー

拡張機能が通信するサーバーは 1 つだけ、`api.raindrop.io`（あなたのトークンを使用）です。
アナリティクスも第三者もありません。何がどこに保存されるかは [PRIVACY.md](PRIVACY.md)（英語）に
まとめています。

## 翻訳

拡張機能の UI は、Raindrop アプリが対応している 16 言語で利用できます。この README は上部に
リンクした言語で読めます。どちらも**英語が原文**で、翻訳と食い違う場合は英語が優先されます。
翻訳の修正・追加方法: [CONTRIBUTING.md](CONTRIBUTING.md#translations)。

## コントリビュート

バグ報告やプルリクエストを歓迎します。開発環境、テスト、プロジェクト構成は
[CONTRIBUTING.md](CONTRIBUTING.md) にあります。

## ライセンス

[MIT](LICENSE) © Goksel Ozardali
