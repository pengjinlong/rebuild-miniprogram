const chokidar = require("chokidar");
const fs = require("fs-extra");
const postcss = require("postcss");
const less = require("less");
const os = require("os"); // 直接引入
const pxtorpx = require("postcss-pxtorpx-pro");
const postcssurl = require("postcss-url");
const { spawn } = require("child_process");
const path = require("path"); // node 自带的，无需安装依赖包，直接引入即可

const localPath = `http://${getLocalIP()}:5000/`;

// 获取本地IP
function getLocalIP() {
  const ifaces = Object.values(os.networkInterfaces());
  for (const iface of ifaces) {
    for (const alias of iface) {
      if (alias.internal || alias.family !== "IPv4") continue;
      return alias.address;
    }
  }
}

async function dev() {
  // 对不同文件进行不同的处理，这里暂时只实现对样式文件的处理
  const cb = (filePath) => {
    if (/\.less$/.test(filePath)) {
      processStyle(filePath);
      return;
    }
    // 将文件拷贝到dist目录
    fs.copy(filePath, filePath.replace("src", "dist"));
  };

  chokidar
    .watch(["src"], {
      ignored: ["**/.{gitkeep,DS_Store}"],
    })
    .on("add", (filePath) => {
      // 监听到有新的文件添加进来执行的逻辑

      // styles 文件夹下的less样式文件不会打包进dist目录
      if (filePath.includes(path.join("src", "styles"))) return;
      cb(filePath);
    })
    .on("change", (filePath) => {
      if (filePath.includes(path.join("src", "styles"))) {
        // 重新编译样式文件
        recompileStyles();
        return;
      }

      cb(filePath);
    });
}

// 样式文件处理
async function processStyle(filePath) {
  let source = await fs.readFile(filePath, "utf8");
  // 在pages文件下的各个样式文件中注入variables和mixins定义的内容
  source =
    `@import '${path.resolve("src/styles/variables.less")}';\n` +
    `@import '${path.resolve("src/styles/mixins.less")}';\n` +
    source;

  // 将less编译为css
  const { css } = await less.render(source, {
    filename: path.resolve(filePath),
  });

  // 处理css
  const { css: wxss } = await postcss()
    .use(pxtorpx({ minPixelValue: 2 }))
    .use(
      postcssurl({
        url(asset) {
          // 如果是网络图片或者base格式，则不处理
          if (/^https?:\/\//.test(asset.url) || asset.url.startsWith("data:")) {
            return asset.url;
          }

          // 处理相对/绝对路径
          const absolutePath = asset.url.startsWith("/")
            ? path.resolve("src", asset.url.slice(1))
            : path.resolve(path.dirname(filePath), asset.url);
          const href =
            localPath + path.relative("src", absolutePath).replace(/\\/g, "/");
          return href;
        },
      })
    )
    .process(css, { map: false, from: undefined });

  // 修改less后缀为wxss并且将文件输出到dist目录
  const destination = filePath
    .replace("src", "dist")
    .replace(/\.less$/, ".wxss");

  await fs.copy(filePath, destination);
  fs.writeFile(destination, wxss);
}

// 由于styles目录下的文件修改可能影响多个文件，所以重新遍历编译一遍所有页面样式文件
function recompileStyles() {
  const watcher = chokidar.watch(["src/**/*.less", "!src/styles/**/*"]);
  watcher.on("add", (filePath) => {
    processStyle(filePath);
  });
  watcher.on("ready", () => watcher.close());
}

spawn("serve", ["src"], { stdio: "inherit", shell: true });
dev();
