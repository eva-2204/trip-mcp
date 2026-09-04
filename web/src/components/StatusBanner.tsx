export default function StatusBanner() {
  return (
    <div className="status-banner">
      Не задан секрет <code>OPENROUTER_API_KEY</code>. AI-агент не может быть запущен.
      Укажите значение секрета <code>OPENROUTER_API_KEY</code> (ключ OpenRouter) и перезапустите
      приложение.
    </div>
  );
}
