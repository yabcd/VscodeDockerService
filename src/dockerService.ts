import * as vscode from 'vscode';
import { NodeSSH } from 'node-ssh';
import { DockerInfo, SSHConnection, SSHManager } from './sshManager';


enum DockerProperties {
    container = "容器",
    image = "镜像",
    network = "网络",
    volume = "卷"
}
enum NodeType {
    CONN, COMPOSE, ALL_IMAGE, ALL_CONTAINER, ALL_NETWORK,
    ALL_VOLUME, COMPOSE_IMAGE, COMPOSE_CONTAINER,
    CONTAINER, IMAGE, NETWORK, VOLUME
}

interface DockerNode {
    id: string; // 对应的连接id
    type: NodeType
    name: string
    p: Record<string, string>
    parent: DockerNode | undefined
    isCollapsible?: boolean
}


export class DockerServiceModel {
    // 缓存左侧树状列表
    dockerCache: Record<string, DockerInfo> = {};
    currentId: string = "";

    constructor(readonly sshManager: SSHManager) {

    }

    public async getChildren(element?: DockerNode): Promise<DockerNode[]> {
        if (!element) {
            return this.sshManager.listConnettion().map(item => {
                return {
                    type: NodeType.CONN,
                    id: item.id,
                    name: item.name || item.host,
                    p: {},
                    parent: element,
                    isCollapsible: true
                };
            });
        }

        const id = element.id;
        const docker = await this.getDockerInfo(id);


        switch (element.type) {
            case NodeType.CONN:
                return [
                    ...docker.composes.map(item => {
                        return { id, name: `Docker-compose: ${item}`, type: NodeType.COMPOSE, p: { cName: item }, parent: element, isCollapsible: true };
                    }),
                    { id, name: "容器", type: NodeType.ALL_CONTAINER, p: {}, parent: element, isCollapsible: true },
                    { id, name: "镜像", type: NodeType.ALL_IMAGE, p: {}, parent: element, isCollapsible: true },
                    { id, name: "网络", type: NodeType.ALL_NETWORK, p: {}, parent: element, isCollapsible: true },
                    { id, name: "卷", type: NodeType.ALL_VOLUME, p: {}, parent: element, isCollapsible: true },
                ];
            case NodeType.COMPOSE:
                return docker.containers.filter(c => c.composeName === element.p["cName"]).map(con => {
                    return {
                        id,
                        name: con.image.name,
                        type: NodeType.COMPOSE_IMAGE,
                        p: { c: con.name },
                        parent: element,
                        isCollapsible: true
                    }
                });
            case NodeType.ALL_CONTAINER:
                return docker.containers.filter(c => !c.composeName).map(con => {
                    return {
                        id,
                        name: con.name,
                        type: NodeType.CONTAINER,
                        p: {},
                        parent: element,
                    };
                });
            case NodeType.ALL_IMAGE:
                return docker.images.map(image => {
                    return { id, name: image.name, type: NodeType.IMAGE, p: {}, parent: element }
                })
            case NodeType.ALL_NETWORK:
                return docker.networks.map(network => {
                    return { id, name: network, type: NodeType.NETWORK, p: {}, parent: element }
                })
            case NodeType.ALL_VOLUME:
                return docker.volumes.map(volume => {
                    return { id, name: volume, type: NodeType.VOLUME, p: {}, parent: element }
                })
            case NodeType.COMPOSE_IMAGE:
                return [{
                    id, name: element.p["c"], type: NodeType.COMPOSE_CONTAINER, p: {}, parent: element
                }]

        }
        return [];
    }

    public async getDockerInfo(id: string) {
        if (this.dockerCache[id]) {
            return this.dockerCache[id];
        }
        const docker = await this.sshManager.getDockerinfo(id);
        return docker;
    }
}


export class DockerServiceProvider implements vscode.TreeDataProvider<DockerNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

    constructor(private readonly model: DockerServiceModel) { }

    public refresh(): any {
        this._onDidChangeTreeData.fire(undefined);
    }


    public getTreeItem(element: DockerNode): vscode.TreeItem {
        return {
            label: element.name,
            collapsibleState: element.isCollapsible ? vscode.TreeItemCollapsibleState.Collapsed : void 0,
            contextValue: element.type.toString()
        };
    }

    public getChildren(element?: DockerNode): DockerNode[] | Thenable<DockerNode[]> {
        return this.model.getChildren(element);
    }

    public getParent(element: DockerNode): DockerNode | undefined {
        return element.parent;
    }
}


export class DockerServiceExplorer {

    constructor(context: vscode.ExtensionContext) {
        /* Please note that login information is hardcoded only for this example purpose and recommended not to do it in general. */
        const sshManager = new SSHManager(context);
        const model = new DockerServiceModel(sshManager);
        const treeDataProvider = new DockerServiceProvider(model);


        // vscode.window.registerTreeDataProvider("dockerService", treeDataProvider);

        const treeView = vscode.window.createTreeView('dockerService', { treeDataProvider });

        treeView.onDidChangeSelection((e) => {
            vscode.commands.executeCommand('dockerService.singleClick', e.selection[0]);
        });


        // 定义一些事件
        context.subscriptions.push(
            vscode.commands.registerCommand('dockerService.refresh', () => treeDataProvider.refresh()),
            vscode.commands.registerCommand('dockerService.addItem', () => {
                model.sshManager.update(undefined).then(() => {
                    treeDataProvider.refresh();
                });
            }),
            vscode.commands.registerCommand('dockerService.updateItem', (item: DockerNode) => {
                model.sshManager.update(item.id).then(() => {
                    treeDataProvider.refresh();
                });
            }),
            vscode.commands.registerCommand('dockerService.deleteItem', (item: DockerNode) => {
                model.sshManager.delete(item.id);
                treeDataProvider.refresh();
            }),
            vscode.commands.registerCommand('dockerService.singleClick', (item: DockerNode) => {
                // 选择后的展示
                

            }),

        );
    }
}