[![English](https://img.shields.io/badge/lang-English-blue)](README.md) [![中文](https://img.shields.io/badge/lang-中文-red)](README.zh-CN.md)

# Dragger

**像 Notion 一样，在 Obsidian 中拖拽任意块来重新排列内容。**

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.0.0-7c3aed?logo=obsidian&logoColor=white) ![License](https://img.shields.io/github/license/Ariestar/obsidian-dragger) ![Release](https://img.shields.io/github/v/release/Ariestar/obsidian-dragger)

## 功能

- 🧱 **块级拖拽** — 段落、标题、列表、任务、引用、Callout、表格、代码块、数学块
- 📐 **嵌套拖拽** — 横向位置控制缩进层级，纵向位置控制插入行
- 🔗 **多行选取拖拽** — 长按或点击选取多行，整组拖动
- 🎨 **手柄外观可定制** — 4 种图标（圆点 / 六点 / 三横线 / 方块）、可调大小、颜色、横向偏移
- 📍 **可视化落点指示器** — 发光线条精确显示块将被放置的位置
- 📱 **移动端支持** — Android 已测试

## 安装

### 社区插件

打开 **设置 → 第三方插件 → 浏览**，搜索 **Dragger** 并安装。

### BRAT（Beta）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 在 BRAT 设置中点击 **Add Beta Plugin**，输入：
   ```
   Ariestar/obsidian-dragger
   ```
3. 在 **设置 → 第三方插件** 中启用插件

### 手动安装

从 [最新 Release](https://github.com/Ariestar/obsidian-dragger/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`，复制到：

```
<你的仓库>/.obsidian/plugins/dragger/
```

重启 Obsidian 并启用插件。

## 使用

1. **悬停** 在任意块的左侧边缘，显示拖拽手柄
2. **拖动** 手柄到目标位置 — 发光指示器显示块将被插入的位置
3. **松开** 即可完成放置

**嵌套列表与引用：** 拖动时横向移动光标可控制缩进层级。

**多行选取：** 长按（触屏）或点击多个手柄选取范围，然后拖动整个选区。

**移动端文本长按拖拽：** 开启后，可在文本整行或块内容区域长按直接拖动单个块，无需先去点左侧手柄。

> 💡 **提示：** 建议在 Obsidian 设置中开启行号显示 — 手柄会出现在行号栏的位置，操作更直观。

## 设置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| **手柄颜色** | 跟随主题强调色或自定义颜色 | 主题色 |
| **手柄显示模式** | 悬停显示 / 始终显示 / 隐藏 | 悬停 |
| **手柄图标** | ● 圆点 / ⠿ 六点抓手 / ☰ 三横线 / ■ 方块 | 圆点 |
| **手柄大小** | 12 – 28 px | 16 px |
| **手柄横向偏移** | 向左（−80）或向右（+80）微调位置 | 0 px |
| **指示器颜色** | 跟随主题强调色或自定义颜色 | 主题色 |
| **多行选取** | 启用选取后拖拽的工作流 | 开启 |
| **移动端文本长按拖拽** | 移动端在文本整行或块内容区域长按可直接拖拽单个块 | 开启 |
| **跨文件拖拽** | 允许将块拖拽到另一个已打开文件的编辑器中 | 关闭 |
| **拖拽源视觉样式** | 拖拽源高亮和列表落点高亮共用的样式（纯边框 / 简约高亮 / 背景增强） | 简约高亮 |
| **拖拽源高亮** | 开关拖拽时被拖动块的高亮 | 开启 |
| **列表落点高亮** | 开关列表拖拽落点区域的高亮 | 开启 |

## 兼容性

- Obsidian **≥ 1.0.0**
- 桌面端（Windows、macOS、Linux）+ 移动端（Android 已测试）

## 开发

```bash
npm install
npm run dev       # 监听模式，热重载
npm run build     # 生产构建
npm run test      # 运行 Vitest 测试套件（116 个测试）
npm run typecheck # TypeScript 类型检查
```


## 提交前本地检查

建议在推送前按以下顺序执行，确保与 AutoReview 的检查口径一致：

```bash
npm install
npm run lint:review
npm run typecheck
npm run test
```

`lint:review` 使用了 `--max-warnings=0`，可在本地严格拦截会导致审核失败的问题。
## 许可

[MIT](LICENSE)

## 贡献

欢迎提交 PR 和 Issue！

如果这个插件对你有帮助，欢迎在 GitHub 点个 ⭐

