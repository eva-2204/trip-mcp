import type { ChatMessage } from "../types";

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
        ) : (
          message.text
        )}
      </div>
    </div>
  );
}
