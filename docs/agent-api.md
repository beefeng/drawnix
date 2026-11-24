# Agent 操作 API

Drawnix 提供了一组面向 AI 助手和浏览器自动化的画布操作 API。Web 应用启动后会自动挂载到：

```js
window.drawnixAgent;
```

如果希望直接在页面里用自然语言操作画布，见 [Web 对话页面](chat.md)。

也可以在嵌入 Drawnix 时显式开启，并自定义全局名称：

```tsx
<Drawnix agent={{ globalName: 'drawnixAgent' }} />
```

画布初始化完成后才会挂载该对象。浏览器自动化中建议先等待：

```js
await page.waitForFunction(() => Boolean(window.drawnixAgent));
```

## 能做什么

| 方法 | 说明 |
| --- | --- |
| `getDocument()` | 获取元素、视口、主题和当前选择 |
| `getElements()` | 获取全部元素（深拷贝） |
| `getSelection()` | 获取选中元素 ID 和选择框 |
| `addElements(elements)` | 新增形状、文本和箭头，支持在同一批中按 ID 连线 |
| `updateElements(updates)` | 按 ID 修改位置、尺寸、文本和样式 |
| `deleteElements(ids)` | 按 ID 删除元素 |
| `clear()` | 清空画布 |
| `selectElements(ids)` | 按 ID 选中元素 |
| `setViewport({ origination, zoom })` | 设置视口原点和缩放 |
| `fitViewport()` | 自适应全部内容 |
| `undo()` / `redo()` | 撤销 / 重做 |
| `exportJSON()` | 导出与 `.drawnix` 文件一致的数据 |
| `execute(operation)` | 以 `{ action, payload }` 形式批量调用 |

直接调用方法失败时会抛出错误；`execute` 不会抛错，而是返回：

```ts
{ ok: true, result }
// 或
{ ok: false, error: { name, message } }
```

`selectElements` 会立即返回选中结果，画布上的选中框和操作柄在下一帧刷新。

## 新增元素

所有坐标都使用画布坐标（不是屏幕坐标），与 `getElements()` 返回的 `points` 一致。

```js
const agent = window.drawnixAgent;

agent.addElements([
  {
    id: 'api',
    shape: 'rectangle',
    x: 100,
    y: 100,
    width: 220,
    height: 80,
    text: 'API 服务',
    fill: '#e3f2fd',
    strokeColor: '#1976d2',
  },
  {
    id: 'db',
    shape: 'diamond',
    x: 480,
    y: 100,
    width: 200,
    height: 100,
    text: '数据库',
    fill: '#fff3e0',
    strokeColor: '#f57c00',
  },
  {
    kind: 'arrow',
    id: 'api-to-db',
    from: { elementId: 'api' },
    to: { elementId: 'db' },
    text: '读写',
    targetMarker: 'arrow',
  },
]);
```

箭头通过 `from.elementId` / `to.elementId` 绑定到元素，并自动选择靠近对方的边。也可以指定连接边：

```js
{
  kind: 'arrow',
  from: { elementId: 'api', side: 'right' },
  to: { elementId: 'db', side: 'left' }
}
```

自由端点可以直接给坐标：

```js
{
  kind: 'arrow',
  from: { x: 100, y: 300 },
  to: { x: 400, y: 300 }
}
```

支持的形状来自 Plait 的 `BasicShapes`、`FlowchartSymbols` 和 `UMLSymbols`，例如
`rectangle`、`ellipse`、`diamond`、`roundRectangle`、`triangle`、`process`、`decision`、
`database` 等。箭头形状支持 `straight`、`curve`、`elbow`。

## 修改和删除

```js
agent.updateElements([
  {
    id: 'api',
    x: 120,
    width: 260,
    text: 'API Gateway',
    fill: '#e8f5e8',
  },
]);

agent.deleteElements(['api-to-db']);
```

`updateElements` 支持 `x`、`y`、`width`、`height`、`points`、`text`、`fill`、
`strokeColor`、`strokeWidth`、`strokeStyle`、`fillStyle`、`opacity`、`angle`。
箭头还可以通过 `points` 直接改变路径。

## 批量执行

适合浏览器自动化或函数调用协议：

```js
const result = window.drawnixAgent.execute({
  action: 'addElements',
  payload: [
    {
      id: 'step-1',
      shape: 'rectangle',
      x: 0,
      y: 0,
      width: 180,
      height: 70,
      text: '开始',
    },
  ],
});

if (!result.ok) {
  console.error(result.error);
}
```

可用 `action`：`getDocument`、`getElements`、`getSelection`、`addElements`、
`updateElements`、`deleteElements`、`clear`、`selectElements`、`setViewport`、
`fitViewport`、`undo`、`redo`、`exportJSON`。

## 在浏览器自动化中使用

```js
await page.evaluate(() => {
  window.drawnixAgent.addElements([
    {
      shape: 'rectangle',
      x: 80,
      y: 80,
      width: 200,
      height: 80,
      text: '由 Agent 创建',
    },
  ]);
});
```

## 约束

- 传入的 `id` 必须唯一；与画布已有元素冲突时会拒绝本次操作。
- `addElements` 会保留传入的 ID 和绝对坐标，便于后续更新和绑定。
- 当前结构化输入覆盖形状、文本和箭头；图片、思维导图、表格和自由画笔暂未提供结构化创建接口。
