# Событие *EVENT_BEFORE_SIGNATURE*
## Назначение события
Событие возникает перед появлением всплывающей подсказки по вызову процедуры/метода

## Управление событием
За генерацию события отвечает опция [`generateBeforeSignatureEvent`](set_option.md)

## Пример вызова
```javascript
// Включение генерации события
setOption('generateBeforeSignatureEvent', true);

// Отключение генерации события
setOption('generateBeforeSignatureEvent', false);
```

## Пример параметров генерируемого события
```json
{
    "word": "состояние",
    "line": 16,
    "column": 13,
    "activeParameter": 0,
    "activeSignature": 0,
    "triggerCharacter": "("
}
```