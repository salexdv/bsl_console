# Событие *EVENT_CONTENT_CHANGED*
## Назначение события
Событие генерируется при любом изменении содержимого редактора

## Управление событием
За генерацию события отвечает опция [`generateModificationEvent`](set_option.md)

## Пример вызова
```javascript
// Включение генерации события
setOption('generateModificationEvent', true);

// Отключение генерации события
setOption('generateModificationEvent', false);
```

## Пример параметров генерируемого события
Параметры у события отсутствуют