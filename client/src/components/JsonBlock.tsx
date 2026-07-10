import { useState } from 'react';

interface JsonBlockProps {
  data: unknown;
}

export function JsonBlock({ data }: JsonBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const text = formatJson(data);
  const isLong = text.length > 360 || text.split('\n').length > 10;

  return (
    <div className="json-block-wrap">
      <pre className={`json-block ${expanded ? 'json-block-expanded' : ''}`}>{text}</pre>
      {isLong && (
        <button type="button" className="json-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Свернуть' : 'Показать целиком'}
        </button>
      )}
    </div>
  );
}

function formatJson(data: unknown): string {
  if (data === undefined) return '';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
