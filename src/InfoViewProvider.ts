import * as vscode from 'vscode';

export class InfoViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "dockerService2";

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): Thenable<void> | void {

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = `<html><body>你好，我是Webview</body></html>`;
    }

    dispose() {
        
	}
}