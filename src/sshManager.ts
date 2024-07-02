import { NodeSSH } from 'node-ssh';
import * as vscode from 'vscode';

export interface SSHConnection {
    id: string; // 每个连接的唯一标识符
    name: string; //给连接起的名字
    host: string;
    port: number;
    username: string;
    privateKeyPath: string;
}

interface Image {
    name: string;
    tag: string;
}

interface Container {
    name: string;
    image: Image;
    composeName: string;
    isRunning: boolean;
}


export interface DockerInfo {
    containers: Container[]
    images: Image[]
    networks: string[]
    volumes: string[]
    composes: string[]
}

export class SSHManager {
    // 保存已经开启的连接
    connPool: Record<string, NodeSSH> = {};
    // 保存连接信息
    sshMap: Record<string, SSHConnection> = {};
    context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.sshMap = context.globalState.get<Record<string, SSHConnection>>('sshConnections') || {};
        this.context = context;
        // this.sshMap["123"] = {
        //     id: "123",
        //     name: "test",
        //     host: "81.70.163.254",
        //     username: "root",
        //     port: 22,
        //     privateKeyPath: ""
        // };
        // context.secrets.store("sshPassword_123", "ybp.1340719002");
    }

    public async update(id: string | undefined) {
        let c = {} as SSHConnection;
        if (!!id) {
            c = this.sshMap[id];
        }

        c.name = await vscode.window.showInputBox({
            placeHolder: "请输入连接名字",
            value: c.name,
        }) || "";

        c.host = await vscode.window.showInputBox({
            placeHolder: "请输入连接IP",
            value: c.host,
        }) || "";

        const portStr = await vscode.window.showInputBox({
            placeHolder: "请输入连接端口，默认22",
            value: c.port ? c.port.toString() : "",
        }) || "22";
        c.port = Number(portStr);

        c.username = await vscode.window.showInputBox({
            placeHolder: "请输入连接用户名",
            value: c.username,
        }) || "";

        const password = await vscode.window.showInputBox({
            placeHolder: "请输入连接密码",
            password: true,
            value: "",
        });

        c.id = id || generateId();
        this.sshMap[c.id] = c;

        this.context.globalState.update("sshConnections", this.sshMap);
        if (password) {
            this.context.secrets.store(`sshPassword_${c.id}`, password);
        }
    }

    public delete(id: string) {
        delete this.sshMap[id];
        this.context.globalState.update("sshConnections", this.sshMap);
        this.context.secrets.delete(`sshPassword_${id}`);
        this.closeConn(id);
    }

    public listConnettion(): SSHConnection[] {
        return Object.values(this.sshMap);
    }

    public async closeConn(id: string) {
        const ssh = this.connPool[id];
        if (!ssh) {
            return;
        }
        ssh.dispose();
    }


    public async run(id: string, command: string): Promise<string> {
        const ssh = await this.getConn(id);
        const info = await ssh.execCommand(command);
        return info.stdout || "";
    }


    public async getDockerinfo(id: string) {
        const ssh = await this.getConn(id);
        let result = await ssh.execCommand(`docker images --format "{{.Repository}} {{.Tag}}"`);
        const docker: DockerInfo = {} as DockerInfo;
        docker.images = result.stdout.split("\n").map(item => {
            const [name, tag] = item?.split(" ");
            return { name, tag } as Image;
        });

        result = await ssh.execCommand(`docker ps -a --format '{{.Names}} {{.Image}} {{.State}} {{.Labels}}'`);
        docker.containers = result.stdout.split("\n").map(item => {
            const [name, image, state, labels] = item?.split(" ");

            return {
                name,
                image: getImage(image),
                composeName: getComposeName(labels),
                isRunning: state === "running"
            } as Container;
        });

        result = await ssh.execCommand(`docker network ls --format "{{.Name}}"`);
        docker.networks = result.stdout.split("\n");

        result = await ssh.execCommand(`docker volume ls --format "{{.Name}}"`);
        docker.volumes = result.stdout.split("\n");

        const composes = docker.containers.map(item => item.composeName).filter(item => !!item);
        docker.composes = Array.from(new Set(composes));

        return docker;
    }


    private async getConn(id: string) {
        if (this.connPool[id]) {
            return this.connPool[id];
        }
        const c = this.sshMap[id]!;
        const ssh = new NodeSSH();
        const password = await this.context.secrets.get(`sshPassword_${c.id}`);
        await ssh.connect({
            host: c.host,
            username: c.username,
            password
        }).catch(err => {
            vscode.window.showErrorMessage(err);
        });
        this.connPool[id] = ssh;
        return this.connPool[id];
    }
}


function generateId() {
    const timestamp = Date.now().toString(); // 当前时间戳
    const randomNum = Math.floor(Math.random() * 1000000).toString(); // 随机数
    return `${timestamp}-${randomNum}`;
}

function getImage(i: string): Image {
    const items = i.split(":")
    return {
        name: items[0],
        tag: items[1] || "latest"
    }
}


function getComposeName(labels: string): string {
    if (!labels) { return ""; }
    const labelList = labels.split(",");
    
    for (let i = 0; i < labelList.length; i++) {
        const [key, value] = labelList[i].split("=");
        if (key === "com.docker.compose.project") {
            return value;
        }
    }

    return "";
}