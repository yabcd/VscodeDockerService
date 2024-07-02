const { NodeSSH } = require('node-ssh');

const ssh = new NodeSSH();

setTimeout(async () => {
    // await ssh.connect({
    //     host: '81.70.163.254',
    //     username: 'root',
    //     password: "ybp.1340719002"
    // });
    await ssh.connect({
        host: '192.168.0.141',
        username: 'root',
        password: "sadhu1231N@34"
    });

    let result = await ssh.execCommand(`docker images --format "{{.Repository}} {{.Tag}}"`);
    const docker = {};
    docker.images = result.stdout.split("\n").map(item => {
        const items = item.split(" ");
        return {
            name: items[0],
            tag: items[1],
        };
    });

    result = await ssh.execCommand(`docker ps -a --format '{{.Names}} {{.Image}} {{.Labels}} {{.State}}'`);
    docker.containers = result.stdout.split("\n").map(item => {
        const items = item.split(" ");

        return {
            name: items[0],
            image: items[1],
            ComposeName: getComposeName(items[2]),
            isRunning: items[3] === "running"
        };
    })

    result = await ssh.execCommand(`docker network ls --format "{{.Name}}"`);
    docker.networks = result.stdout.split("\n");

    result = await ssh.execCommand(`docker volume ls --format "{{.Name}}"`);
    docker.volumes = result.stdout.split("\n");
    const composes = docker.containers.map(item => item.ComposeName).filter(item => !!item);
    docker.composes = Array.from(new Set(composes));
    
    console.log(docker);
});

function getImage(i) {
    const items = i.split(":");
    return {
        name: items[0],
        tag: items[1] || "latest"
    }
}

function getComposeName(labels) {
    const labelList = labels.split(",");

    for (let i = 0; i < labelList.length; i++) {
        const [key, value] = labelList[i].split("=");
        if (key === "com.docker.compose.project") {
            return value;
        }
    }

    return "";
}