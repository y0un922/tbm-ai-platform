// 模型输出的 Markdown 渲染（支持 GFM 表格、列表、代码块）
// 单个 ~ 不当删除线：模型常用 "~64" 表示"约 64"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{text}</ReactMarkdown>
    </div>
  )
}
