# Событие *EVENT_ON_INSERT_SNIPPET*

## Назначение события

Событие возникает при вставке сниппета (шаблона)

## Управление событием

За генерацию события отвечает опция [`generateSnippetEvent`](set_option.md)

## Пример вызова
```javascript
// Включение генерации события
setOption('generateSnippetEvent', true);

// Отключение генерации события
setOption('generateSnippetEvent', false);
```

## Пример параметров генерируемого события
```json
{
  "text": "Выборка = РегистрыНакопления.ОстаткиТоваров.Выбрать();\nПока Выборка.Следующий() Цикл\n\t\nКонецЦикла;",
  "range": {
    "startLineNumber": 17,
    "startColumn": 11,
    "endLineNumber": 20,
    "endColumn": 12
  },
  "position": {
    "lineNumber": 17,
    "column": 54
  },
  "selection": {
    "startLineNumber": 17,
    "startColumn": 40,
    "endLineNumber": 17,
    "endColumn": 54,
    "selectionStartLineNumber": 17,
    "selectionStartColumn": 40,
    "positionLineNumber": 17,
    "positionColumn": 54
  },
  "selected_text": "ОстаткиТоваров"
}
```