# AI inline-подсказки через 1С

## Назначение

Редактор определяет момент запроса и показывает результат штатным механизмом inline-подсказок Monaco.
1С выполняет сетевой вызов AI-провайдера. URL, ключи, prompt и ответ провайдера не хранятся в JavaScript.

Механизм работает для `bsl`, `bsl_query` и `dcs_query` и по умолчанию выключен:

```javascript
setOption('generateAIInlineCompletionEvent', true);
```

После пользовательской правки редактор ждёт `aiInlineCompletionDebounceMs` и создаёт
`EVENT_AI_INLINE_COMPLETION_REQUEST`. Программные изменения через `setText`, `updateText`, `setContent`
и `eraseText` запросов не создают. Вызов `triggerInlineSuggestions()` создаёт явный запрос без задержки.

## EVENT_AI_INLINE_COMPLETION_REQUEST

```json
{
  "protocolVersion": 1,
  "requestId": 17,
  "modelVersionId": 42,
  "modelUri": "inmemory://model/1",
  "languageId": "bsl",
  "position": { "lineNumber": 12, "column": 18 },
  "triggerKind": "automatic",
  "triggerCharacter": "=",
  "context": {
    "prefix": "...",
    "suffix": "...",
    "prefixTruncated": true,
    "suffixTruncated": false
  }
}
```

`prefix` и `suffix` — снимок модели относительно курсора. Их длина ограничивается опциями
`aiInlineCompletionMaxPrefixChars` и `aiInlineCompletionMaxSuffixChars`. Пробелы и переводы строк
сохраняются. `triggerKind` принимает значения `automatic` и `explicit`; у явного запроса
`triggerCharacter` пустой.

## Передача результата

После завершения сетевого запроса 1С вызывает:

```javascript
resolveAIInlineCompletion(17, [
  ' = Новый Запрос();\nЗапрос.Текст = "ВЫБРАТЬ";'
]);
```

Массив можно передать как JSON-строку:

```javascript
resolveAIInlineCompletion(17, '[" = Новый Запрос();"]');
```

Функция возвращает:

* `true` — активный запрос завершён, в том числе пустым массивом;
* `false` — запрос отменён, просрочен либо потерял актуальность;
* `{ errorDescription }` — передано невалидное значение.

Ответ показывается только для той же модели, версии и позиции. Tab принимает подсказку, Esc скрывает её.
Пустой массив следует передавать при отсутствии результата или ошибке AI.

## EVENT_AI_INLINE_COMPLETION_CANCEL

Если уже отправленный запрос перестал быть актуальным, редактор генерирует:

```json
{
  "protocolVersion": 1,
  "requestId": 17,
  "reason": "superseded"
}
```

Причины: `superseded`, `cursorChanged`, `hidden`, `disabled`, `timeout`, `disposed`. Обработка события
необязательна, но позволяет прервать внешний запрос. Отмена во время debounce события не создаёт.

## Схема обработчика 1С

```bsl
Если ДанныеСобытия.event = "EVENT_AI_INLINE_COMPLETION_REQUEST" Тогда
    ЗапросAI = ДанныеСобытия.params;
    ЗапуститьАсинхронныйЗапросAI(ЗапросAI, Новый ОписаниеОповещения(
        "ПослеПолученияAIПодсказки", ЭтотОбъект, ЗапросAI.requestId));

ИначеЕсли ДанныеСобытия.event = "EVENT_AI_INLINE_COMPLETION_CANCEL" Тогда
    ОтменитьЗапросAI(ДанныеСобытия.params.requestId);
КонецЕсли;

Процедура ПослеПолученияAIПодсказки(Результат, ИдентификаторЗапроса) Экспорт
    ОкноРедактора = Элементы.ПолеHTMLДокумента.Документ.defaultView;
    ОкноРедактора.resolveAIInlineCompletion(
        ИдентификаторЗапроса,
        СериализоватьМассивСтрокВJSON(Результат));
КонецПроцедуры
```

Сетевой вызов не должен блокировать UI-поток. Токен провайдера нельзя передавать в редактор, события или
журнал регистрации.
