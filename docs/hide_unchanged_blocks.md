# Функция *hideUnchangedBlocks*

## Назначение функции

Сворачивает неизмененные блоки строк, когда редактор находится в [режиме сравнения](compare.md)

## Параметры функции

* Отсутствуют

## Пример вызова

```javascript
compare(text, true, true);
hideUnchangedBlocks();
```

## Описание полей результата

* **original** - Массив свернутых диапазонов строк в оригинальном коде
  * **startLineNumber** - Номер начальной строки
  * **endLineNumber** - Номер конечной строки
* **modified** - Массив свернутых диапазонов строк в модифицированном коде
  * **startLineNumber** - Номер начальной строки
  * **endLineNumber** - Номер конечной строки

## Пример возвращаемого значения

```json
{
  "original": [
    {
      "startLineNumber": 3,
      "endLineNumber": 5
    }
  ],
  "modified": [
    {
      "startLineNumber": 12,
      "endLineNumber": 14
    }
  ]
}
```

