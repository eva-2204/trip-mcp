interface Props {
  label: string;
  value: unknown;
  openByDefault?: boolean;
}

export default function JsonViewer({ label, value, openByDefault }: Props) {
  if (value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <details className="json-block" open={openByDefault}>
      <summary>{label}</summary>
      <pre>{text}</pre>
    </details>
  );
}
