import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types";
import { insertEmojiImages } from "../emoji";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message-row ${message.role}`}>
      <div className={`message-bubble ${message.pending ? "pending" : ""}`}>
        {message.pending ? (
          <>
            Думаю…
            <span className="typing-dots">
              <span />
              <span />
              <span />
            </span>
          </>
        ) : message.role === "assistant" ? (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{insertEmojiImages(message.text)}</ReactMarkdown>
          </div>
        ) : (
          message.text
        )}
      </div>
    </div>
  );
}
