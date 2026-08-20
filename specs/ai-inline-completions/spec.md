---
issue: -
title: AI inline-подсказки через мост 1С
status: done
owner: salexdv
created: 2026-08-20
updated: 2026-08-20
area:
  - обвязка редактора
  - мост 1С
---

# ai-inline-completions: AI inline-подсказки через мост 1С

## 1. Контекст

Редактор умеет отображать inline-подсказки штатным provider API Monaco 0.55, но не имеет асинхронного
lifecycle для внешнего AI. Сетевое взаимодействие, авторизация и prompt остаются в 1С; редактор отвечает
за момент запроса, снимок контекста, отмену и безопасное отображение ответа.

## 2. Поведение

1. Механизм выключен, пока 1С не вызовет `setOption('generateAIInlineCompletionEvent', true)`.
2. После пользовательской правки native inline-controller Monaco вызывает AI-provider. Provider выдерживает
   настроенный debounce и отправляет `EVENT_AI_INLINE_COMPLETION_REQUEST`.
3. 1С асинхронно получает результат и вызывает `resolveAIInlineCompletion`.
4. Ответ отображается только для той же модели, версии и позиции. Tab принимает подсказку, Esc скрывает её.

Серия правок объединяется в один запрос. Перемещение курсора не создаёт запрос и отменяет активный.
`triggerInlineSuggestions()` создаёт explicit-запрос без debounce. Программные изменения через публичные
методы редактора, diff/read-only режим и непустое выделение запросов не создают.

Пользовательский `showInlineSuggestion` имеет приоритет: AI-provider объявляет `yieldsToGroupIds` на группу
существующего provider и не запускает внешний запрос, если тот вернул видимый результат.

## 3. Контракт

### 3.1. Функции моста

```js
resolveAIInlineCompletion(requestId, suggestions)
triggerInlineSuggestions()
```

`suggestions` — массив строк либо JSON-строка. Callback возвращает `true`, `false` или
`{ errorDescription }`. `triggerInlineSuggestions()` использует `editor.action.inlineSuggest.trigger`.

### 3.2. События

| Событие | Payload |
| --- | --- |
| `EVENT_AI_INLINE_COMPLETION_REQUEST` | `{protocolVersion, requestId, modelVersionId, modelUri, languageId, position, triggerKind, triggerCharacter, context}` |
| `EVENT_AI_INLINE_COMPLETION_CANCEL` | `{protocolVersion, requestId, reason}` |

Версия протокола — `1`. Причины отмены: `superseded`, `cursorChanged`, `hidden`, `disabled`, `timeout`,
`disposed`.

### 3.3. Опции

| Опция | По умолчанию |
| --- | ---: |
| `generateAIInlineCompletionEvent` | `false` |
| `aiInlineCompletionDebounceMs` | `400` |
| `aiInlineCompletionRequestTimeoutMs` | `15000` |
| `aiInlineCompletionMaxPrefixChars` | `16000` |
| `aiInlineCompletionMaxSuffixChars` | `4000` |

Provider работает для `bsl`, `bsl_query` и `dcs_query`.

## 4. Ошибки и ограничения

- Тайм-аут завершает native provider пустым результатом и создаёт cancel event.
- Неизвестный либо устаревший `requestId` возвращает `false`.
- Невалидный массив возвращает `{ errorDescription }` и не изменяет редактор.
- HTTP-клиент, ключи, prompt, RAG, streaming, чат и code actions не входят в изменение.

## 5. Критерии приёмки

- [x] По умолчанию AI-события не создаются.
- [x] Пользовательская правка создаёт один запрос с ограниченным контекстом.
- [x] Актуальный ответ отображается native ghost text и принимается штатной командой Monaco.
- [x] Новая правка, курсор, Esc, отключение, timeout и dispose отменяют активный запрос.
- [x] Программные правки и устаревшие ответы не создают подсказку.
- [x] `showInlineSuggestion`, браузерные тесты и single-file/ES-floor не регрессируют.
