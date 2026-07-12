# trip-mcp

Демонстрационный AI Travel Agent на Claude Code с использованием **Model Context Protocol (MCP)**.

Показывает, как LLM (Claude через OpenRouter) взаимодействует с внешними MCP-серверами —
**Kiwi MCP** (поиск авиабилетов) и **Trivago MCP** (поиск отелей) — без единого прямого
обращения к REST API этих сервисов: весь обмен идёт по протоколу MCP (JSON-RPC поверх
Streamable HTTP).

## Архитектура

```
web/     — React + Vite фронтенд: чат (40%) и панель логов MCP-вызовов (60%)
server/  — Express + TypeScript бэкенд
  src/mcp/       — низкоуровневый MCP HTTP-клиент + клиенты Kiwi и Trivago
  src/agent/     — оркестрация LLM (OpenRouter), инструменты, перевод городов
  src/logging/   — шина событий журнала, транслируемая на фронтенд через SSE
  src/routes/    — /api/chat, /api/logs/stream, /api/status
```

- **MCP-клиент** (`server/src/mcp/mcpHttpClient.ts`) реализован вручную поверх `fetch`,
  а не через готовый SDK — это позволяет захватывать HTTP-статус, тайминг и «сырое» тело
  каждого запроса/ответа для панели логов. Поддерживает как JSON, так и
  `text/event-stream`-ответы (оба варианта реально встречаются у Kiwi и Trivago), и
  сохраняет заголовок `mcp-session-id`, если сервер его возвращает.
- **Kiwi MCP**: `initialize` → `tools/call(search-flight)`, дата в формате `dd/mm/yyyy`.
  Перед вызовом бэкенд проверяет город/аэропорт отправления и назначения по списку
  российских городов/аэропортов (`server/src/mcp/russianAirports.ts`) — Kiwi их не
  поддерживает, поэтому запрос в этом случае не отправляется вовсе.
- **Trivago MCP**: спецификация задачи описывает двухшаговый поток
  `trivago-search-suggestions(query) → {id, ns} → trivago-accommodation-search(id, ns, ...)`.
  Проверка актуального сервера (`tools/list`) показала, что сейчас он отдаёт только
  `trivago-accommodation-search`, принимающий `query` напрямую, без отдельного шага
  подсказок. Клиент (`server/src/mcp/trivagoClient.ts`) определяет набор инструментов
  через `tools/list` и **автоматически выбирает** двухшаговый поток `id/ns`, если сервер
  его предоставляет, либо прямой поиск по `query` — так демо остаётся рабочим против
  реального сервера и совместимым с описанным в ТЗ протоколом, если он туда вернётся.
  Русские названия городов переводятся на английский через Claude/OpenRouter перед
  обращением к Trivago (`server/src/agent/cityTranslate.ts`).
- **LLM**: Claude через OpenRouter (`https://openrouter.ai/api/v1`, модель
  `openrouter/free`), OpenAI-совместимый Chat Completions API с tool calling.
  Агент сам решает, когда не хватает данных, и задаёт короткий уточняющий вопрос вместо
  вызова инструмента с придуманными параметрами.

## Запуск

```bash
npm install
cp .env.example .env   # заполните OPENROUTER_API_KEY
npm run build
npm start               # сервер поднимется на :3000 и отдаст собранный фронтенд
```

Для разработки с hot-reload:

```bash
npm run dev:server   # :3000, API + MCP-клиенты
npm run dev:web       # :5173, Vite dev server (проксирует /api на :3000)
```

Если секрет `OPENROUTER_API_KEY` не задан, сервер отвечает `503` на `/api/chat`, а
фронтенд показывает баннер с просьбой указать ключ и блокирует ввод — приветственное
сообщение агента при этом не выводится.

## Переменные окружения

См. `.env.example`: `OPENROUTER_API_KEY` (обязателен), `PORT`, `KIWI_MCP_URL`,
`TRIVAGO_MCP_URL`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `USD_RUB_RATE`,
`EUR_RUB_RATE`.

## Рублёвый эквивалент цены

Рядом с каждой ценой из Kiwi/Trivago бэкенд детерминированно (без участия LLM)
добавляет приблизительный рублёвый эквивалент в скобках, например `72 EUR (≈6 700 ₽)`
(`server/src/agent/rubEnrich.ts`). Курс — статический, задаётся переменными
`USD_RUB_RATE` / `EUR_RUB_RATE` (по умолчанию 80 и 93): живой источник курса
валют недоступен из окружения разработки этого демо, поэтому курс не
подтягивается автоматически и его стоит обновлять вручную при необходимости.
