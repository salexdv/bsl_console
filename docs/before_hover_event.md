# Событие *EVENT_BEFORE_HOVER*
## Назначение события
Событие возникает перед появлением всплывающей подсказки для слова при наведении мыши

## Управление событием
За генерацию события отвечает опция [`generateBeforeHoverEvent`](set_option.md)

## Пример вызова
```javascript
// Включение генерации события
setOption('generateBeforeHoverEvent', true);

// Отключение генерации события
setOption('generateBeforeHoverEvent', false);
```

## Пример параметров генерируемого события
```json
{
  "word": {
    "word": "Документ",
    "startColumn": 2,
    "endColumn": 10
  },
  "token": "identifierbsl",
  "line": 11,
  "column": 6,
  "definition": {
    "code": "Для Каждого Документ Из МассивДокументов Цикл",
    "iterator": "МассивДокументов",
    "range": {
      "endColumn": 46,
      "endLineNumber": 1,
      "startColumn": 1,
      "startLineNumber": 10
    }
  }
}
```