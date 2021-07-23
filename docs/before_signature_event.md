# Функция *enableBeforeSignatureEvent*
## Назначение функции
Функция включает/выключает генерацию события *EVENT_BEFORE_SIGNATURE*, которое возникает перед появлением всплывающей подсказки по вызову процедуры/метода

## Параметры функции
* **enabled** - *boolean*, активность события

## Пример вызова
```javascript
// Включение генерации события
enableBeforeSignatureEvent(true);

// Отключение генерации события
enableBeforeSignatureEvent(false);
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