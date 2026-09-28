# 盾构机 AI 多智能体协同平台

```
TBM/
  frontend/            Vite + React
  backend/             Node HTTP + SSE，Agent 循环走本机 pi SDK
  docs/                接口与运行视图说明
  tbm_ai_prototype/    早期 HTML 原型，仅参考
```

模型凭证在本机 `~/.pi/agent`，**不进仓库**。未 `pi /login` 时 live Run 会失败。

## 启动

需要 Node 22+。两个终端：

```bash
# 1. 后端
cd backend
npm install
npm run dev          # http://127.0.0.1:8787/api
```

```bash
# 2. 前端（接后端）
cd frontend
npm install
npm run dev:live     # http://localhost:5173 ，/api 代理到 8787
```

浏览器打开 http://localhost:5173 ，进 **AI 协同** → 开始分析。不要出现「演示数据 / 未连接后端」。

只看界面、不打模型：

```bash
cd frontend && npm run dev    # Mock，不必启后端
```

## 自检（不打模型）

```bash
cd frontend && npm run check:graph && npm run check:review && npm run check:runtime && npm run check:playbook && npm run check:transcript
cd backend && npm run check
```

## 说明

- 接口：[`docs/api.md`](docs/api.md)
- 后端契约：[`backend/README.md`](backend/README.md)
- 不向设备下发控制指令
