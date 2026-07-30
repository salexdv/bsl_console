# Событие *EVENT_COMPARE_COMPLETE*

## Назначение события

Событие генерируется при завершении [сравнения](compare.md) текстов 

## Управление событием

За генерацию события отвечает опция [`generateCompareCompleteEvent`](set_option.md)

## Пример вызова

```javascript
// Включение генерации события
setOption('generateCompareCompleteEvent', true);

// Отключение генерации события
setOption('generateCompareCompleteEvent', false);
```

## Параметры события

Отсутствуют