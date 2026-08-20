---
issue: -
title: AI inline-подсказки через мост 1С
status: in-progress
owner: salexdv
created: 2026-08-20
updated: 2026-08-20
area:
  - обвязка редактора
  - мост 1С
---

# ai-inline-completions: AI inline-подсказки через мост 1С

## 1. Контекст и проблема

Редактор умеет отображать и принимать inline-подсказку, но не имеет асинхронного provider lifecycle
для внешнего AI. Сетевое взаимодействие, авторизация и формирование prompt должны оставаться в 1С;
редактор отвечает только за момент запроса, снимок контекста, отмену и безопасное отображение ответа.

## 2. Область изменений

| Компонент | Тип | Характер изменений |
| --- | --- | --- |
| `src/editor.js` | src | cancellation lifecycle, регистрация provider, публичный callback |
| `src/ai_inline_provider.js` | src | debounce, контекст и корреляция запросов |
| `docs/`, `README.md` | docs | опции и контракт моста |

## 3. Поведение

### 3.1. Основной сценарий

1. Механизм выключен, пока 1С не вызовет `setOption('generateAIInlineCompletionEvent', true)`.
2. После пользовательского изменения модели editor ждёт настроенный debounce и отправляет
   `EVENT_AI_INLINE_COMPLETION_REQUEST` со снимком prefix/suffix.
3. Provider возвращает незавершённый Promise. 1С асинхронно вызывает внешний AI и передаёт итоговый
   массив строк через `resolveAIInlineCompletion`.
4. Ответ отображается только для той же модели, версии и позиции. Tab принимает подсказку, Esc скрывает её.

### 3.2. Граничные случаи

- Серия правок объединяется в один запрос.
- Движение курсора не создаёт автоматический запрос и отменяет активный.
- `triggerInlineSuggestions()` создаёт явный запрос без debounce.
- `setText`, `updateText`, `setContent` и `eraseText` не создают AI-запрос.
- В diff/read-only режиме, при выделении или отключённых inline-подсказках запрос не создаётся.

### 3.3. Ошибки

- Тайм-аут ответа — 15 секунд; Promise завершается пустым результатом.
- Неизвестный или устаревший `requestId` возвращает `false`.
- Невалидный массив ответа возвращает `{ errorDescription }` и не изменяет редактор.
- Пустой массив является корректным ответом без подсказки.

## 4. Контракты

### 4.1. Экспортные функции моста

```js
resolveAIInlineCompletion(requestId, suggestions)
```

`suggestions` — массив строк либо JSON-строка с массивом. Возвращает `true`, если активный запрос
завершён, `false` для неизвестного/устаревшего запроса и `{ errorDescription }` для невалидных данных.

### 4.2. События

| Событие | Направление | Payload | Описание |
| --- | --- | --- | --- |
| `EVENT_AI_INLINE_COMPLETION_REQUEST` | JS → 1С | `{protocolVersion, requestId, modelVersionId, modelUri, languageId, position, triggerKind, triggerCharacter, context}` | Запрос итоговой подсказки |
| `EVENT_AI_INLINE_COMPLETION_CANCEL` | JS → 1С | `{protocolVersion, requestId, reason}` | Отмена уже отправленного запроса |

Версия протокола — `1`. Причины отмены: `superseded`, `cursorChanged`, `hidden`, `disabled`, `timeout`,
`disposed`.

### 4.3. Опции

| Опция | По умолчанию |
| --- | ---: |
| `generateAIInlineCompletionEvent` | `false` |
| `aiInlineCompletionDebounceMs` | `400` |
| `aiInlineCompletionRequestTimeoutMs` | `15000` |
| `aiInlineCompletionMaxPrefixChars` | `16000` |
| `aiInlineCompletionMaxSuffixChars` | `4000` |

AI-provider работает для `bsl`, `bsl_query` и `dcs_query`.

## 5. Критерии приёмки

- [x] По умолчанию AI-события не создаются.
- [x] После включения серия правок создаёт один запрос с последней версией и ограниченным контекстом.
- [x] Актуальный ответ отображается и принимается по Tab.
- [x] Новая правка, движение курсора, Esc, отключение и dispose отменяют активный запрос.
- [x] Устаревший ответ не отображается.
- [x] Существующие inline API и single-file/ES2015 сборка работают без регрессии.

## 6. Вне области

- HTTP-клиент, ключи, prompt, RAG и выбор AI-провайдера.
- Streaming, чат, code actions и контекст соседних модулей.
