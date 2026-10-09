# 盾构机多智能体协同 Demo

设计文档：[`docs/Demo核心功能设计文档.md`](docs/Demo核心功能设计文档.md)

```
packages/shared/   前后端共用契约：事件协议、Agent 元数据、CollabHub 接口、事件流校验
server/            Node 服务（开发中）；src/data 为场景数据，spike/ 为技术验证与样本录制脚本
web/               前端（开发中）；dev/sample-run.jsonl 为真实运行录制的事件样本
```

需要 Node 22+。模型为 DeepSeek V4.1 Flash，凭证读环境变量 `DEEPSEEK_API_KEY`，或本机 pi 的 `~/.pi/agent/auth.json`，**不进仓库**。

```bash
npm install

npm run check:data -w @tbm/server       # 场景数据自洽校验（不调模型）
npm run check:sample -w @tbm/shared     # 校验事件样本是否符合契约（不调模型）
npm run typecheck -w @tbm/shared
npm run typecheck -w @tbm/server

npm run spike:concurrency -w @tbm/server   # 5 路并发验证（调模型）
npm run spike:debate -w @tbm/server        # 完整会商，控制台输出过程和协作统计（调模型）
npm run record:sample -w @tbm/server       # 同上，并重新录制 web/dev/sample-run.jsonl
```

平台只给建议，不向设备下发控制指令。
