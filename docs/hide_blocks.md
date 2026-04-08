# Функция *hideBlocks*

## Назначение функции

Сворачивает переданные диапазоны строк в текущем редакторе

## Параметры функции

* **blocks** - *array*, массив диапазонов строк для сворачивания
  * **startLineNumber** - Номер начальной строки
  * **endLineNumber** - Номер конечной строки

## Пример вызова

```javascript
hideBlocks([
  { startLineNumber: 1, endLineNumber: 18 },
  { startLineNumber: 173, endLineNumber: 190 }
]);
```

