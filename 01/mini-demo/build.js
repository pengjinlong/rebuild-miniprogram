const chokidar = require('chokidar');
const fs = require('fs-extra');
const postcss = require('postcss');
const less = require('less');
const path = require('path'); // node 自带的，无需安装依赖包，直接引入即可

async function dev() {
  // 对不同文件进行不同的处理，这里暂时只实现对样式文件的处理 
  const cb = (filePath) => {
     if (/\.less$/.test(filePath)) {
      processStyle(filePath);
      return;
    }
    // 将文件拷贝到dist目录
    fs.copy(filePath, filePath.replace('src', 'dist'));
  }
  
  chokidar
    .watch(['src'], {
      ignored: ['**/.{gitkeep,DS_Store}'],
    })
    .on('add', (filePath) => {
      // 监听到有新的文件添加进来执行的逻辑
      
      // styles 文件夹下的less样式文件不会打包进dist目录
      if (filePath.includes(path.join('src', 'styles'))) return;
      cb(filePath);
    })
    .on('change', (filePath) => {
      // 文件内容改变触发的逻辑
      console.log('change file: ' + filePath)

      if (filePath.includes(path.join('src', 'styles'))) {
        // 重新编译样式文件
        recompileStyles();
        return;
      }

      cb(filePath);
    });
}

// 样式文件处理
async function processStyle(filePath,) {
  let source = await fs.readFile(filePath, 'utf8');
  // 在pages文件下的各个样式文件中注入variables和mixins定义的内容
  source =
    `@import '${path.resolve('src/styles/variables.less')}';\n` +
    `@import '${path.resolve('src/styles/mixins.less')}';\n` +
    source;

  // 将less编译为css  
  const { css } = await less.render(source, {
    filename: path.resolve(filePath),
  });

  // 处理
  const { css: wxss } = await postcss().process(css, { map: false, from: undefined });

  // 修改less后缀为wxss并且将文件输出到dist目录
  const destination = filePath.replace('src', 'dist').replace(/\.less$/, '.wxss');
  
  await fs.copy(filePath, destination);
  fs.writeFile(destination, wxss);
}

// 由于styles目录下的文件修改可能影响多个文件，所以重新遍历编译一遍所有页面样式文件
function recompileStyles() {
    const watcher = chokidar.watch(['src/**/*.less', '!src/styles/**/*']);
    watcher.on('add', (filePath) => {
      processStyle(filePath);
    });
    watcher.on('ready', () => watcher.close());
}

dev()