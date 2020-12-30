# Функция *enableModificationEvent*
## Назначение функции
Функция включает/выключает генерацию события *EVENT_CONTENT_CHANGED*, которое возникает при любом изменении содержимого редактора

## Параметры функции
* **enabled** - *boolean*, активность события

## Пример вызова
```javascript
// Включение генерации события
enableModificationEvent(true);

// Отключение генерации события
enableModificationEvent(false);
```