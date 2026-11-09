import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose prose-sm max-w-none min-w-0 overflow-hidden break-words dark:prose-invert [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          table: ({ node: _node, ...props }) => (
            <div className="my-4 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="表格内容">
              <table {...props} className="my-0 min-w-full" />
            </div>
          ),
          th: ({ node: _node, ...props }) => <th {...props} scope="col" className="px-3 py-2 align-top" />,
          td: ({ node: _node, ...props }) => <td {...props} className="px-3 py-2 align-top" />,
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
