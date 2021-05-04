# Функция *enableBeforeHoverEvent*
## Назначение функции
Функция включает/выключает генерацию события *EVENT_BEFORE_HOVER*, которое возникает перед появлением всплывающей подсказки для слова при наведении мыши

## Параметры функции
* **enabled** - *boolean*, активность события

## Пример вызова
```javascript
// Включение генерации события
enableBeforeHoverEvent(true);

// Отключение генерации события
enableBeforeHoverEvent(false);
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