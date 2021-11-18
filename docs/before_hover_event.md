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
    "word": "Документы",
    "startColumn": 8,
    "endColumn": 17
  },
  "token": "identifierbsl",
  "line": 4,
  "column": 12
}
```