import * as vscode from "vscode";

import * as path from "path";
import { randomUUID } from "crypto";

const urlListMime = "text/uri-list";

class ImageOnDropProvider implements vscode.DocumentDropEditProvider {
  async provideDocumentDropEdits(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    console.log(_document.fileName);

    const wsedit = new vscode.WorkspaceEdit();

    const docDir = path.dirname(_document.uri.fsPath);

    // 対象がワークスペースを開いていない場合は無視
    if (
      !vscode.workspace.workspaceFolders ||
      !vscode.workspace.workspaceFolders[0]
    ) {
      console.log("not workspace");
      return undefined;
    }

    // ワークスペースパス
    const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    // DataTransferから情報を取得する
    const dataTransferItem = dataTransfer.get(urlListMime);

    if (!dataTransferItem) {
      console.log("cannot find dataTransferItem");
      return undefined;
    }

    // URIを取得
    const urlList = await dataTransferItem.asString();
    if (token.isCancellationRequested) {
      return undefined;
    }

    // URIをバラしておく
    const uris: vscode.Uri[] = [];
    // Windowsの場合はCR+LFで入ってきてしまうので、LFに統一してから捌く
    for (const resource of urlList.replace(/\r\n/g, "\n").split("\n")) {
      try {
        uris.push(vscode.Uri.parse(resource));
      } catch {
        // noop
      }
    }

    if (!uris.length) {
      return undefined;
    }

    const snippet = new vscode.SnippetString();

    // ドロップしたファイルをコピーして同じディレクトリに配置
    await Promise.all(
      uris.map(async (uri, index) => {
        try {
          console.log("read file:", uri.fsPath);
          // ファイル名
          const name = path.basename(uri.fsPath);
          // 拡張子
          const ext = path.extname(name);
          // ディレクトリパス
          const dirname = path.dirname(uri.fsPath);

          let destPath = uri;

          // ディレクトリに無いもの（ディレクトリの外から来たもの）はコピーする
          if (path.resolve(dirname) !== path.resolve(docDir)) {
            // データ読み込み
            const data = await vscode.workspace.fs.readFile(uri);

            // 配置先のパスを作成
            // UUIDv4を使用する
            destPath = vscode.Uri.file(
              path.join(path.dirname(_document.uri.fsPath), randomUUID() + ext)
            );

            // ファイルを作成し、書き込み
            wsedit.createFile(destPath, { ignoreIfExists: true });
            await vscode.workspace.fs.writeFile(destPath, data);

            // 適用して結果を確認
            let isDone = await vscode.workspace.applyEdit(wsedit);
            if (isDone) {
              console.log("File created");
            }
          }

          // TODO: スニペットの作成方法についてもう少し検討する必要がある
          const relPath = path.relative(docDir, destPath.fsPath);

          // snippet.appendText(`[$1] (${relPath})`);
          // snippet.appendVariable(`image${index + 1}`, `image${index + 1}`);
          snippet.value += `![\$\{${index + 1}:caption\}](${relPath})  \n`;

          // 出力用のスニペットを作成
          // snippet.appendText(`${index + 1}. ${name}\n`);
        } catch (e: unknown) {
          console.log("error:", uri.fsPath);
          if (e instanceof Error) {
            console.error(e.message, e.stack);
          }
        }
      })
    );

    return new vscode.DocumentDropEdit(snippet);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("register ImageOnDropProvider");

  const selector: vscode.DocumentSelector = [
    { language: "markdown" },
    { language: "plaintext" },
  ];
  context.subscriptions.push(
    vscode.languages.registerDocumentDropEditProvider(
      selector,
      new ImageOnDropProvider()
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
