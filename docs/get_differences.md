# Функция *getDifferences*

## Назначение функции

Возвращает список (массив) различий, когда редактор находится в [режиме сравнения](compare.md)

## Параметры функции

* Отсутствуют

## Пример вызова

```javascript
getDifferences();
```

## Описание полей результата

* **originalStartLineNumber** - Номер начальной строки оригинала
* **originalEndLineNumber** - Номер конечной строки в оригинала. Равен нулю, если блок отсутствует в оригинальном тексте
* **modifiedStartLineNumber** - Номер начальной строки в модифицированном тексте
* **modifiedEndLineNumber** - Номер конечной строки в модифицированном тексте. Равен нулю, если блок отсутствует в модифицированном варианте
* **originalText** - Оригинальный текст в измененном блоке
* **modifiedText** - Модифицированный текст в измененном блоке
* **charChanges** - Массив измененных символов. Заполняется только в том случае, когда измененный блок присутствует в обоих вариантах текста
  * **originalStartLineNumber** - Номер начальной строки в оригинальном тексте
  * **originalStartColumn** - Номер начальной колонки в оригинальном тексте
  * **originalEndLineNumber** - Номер конечной строки в оригинальном тексте
  * **originalEndColumn** - Номер конечной колонки в оригинальном тексте
  * **modifiedStartLineNumber** - Номер начальной строки в модифицированном тексте
  * **modifiedStartColumn** - Номер начальной колонки в модифицированном тексте
  * **modifiedEndLineNumber** - Номер конечной строки в модифицированном тексте
  * **modifiedEndColumn** - Номер конечной колонки в модифицированном тексте
  * **originalText** - Оригинальный текст в измененном блоке
  * **modifiedText** - Модифицированный текст в измененном блоке

## Пример возвращаемого значения

```json
[
    {
        "originalStartLineNumber": 3,
        "originalEndLineNumber": 3,
        "modifiedStartLineNumber": 3,
        "modifiedEndLineNumber": 3,
        "charChanges": [
            {
                "originalStartLineNumber": 3,
                "originalStartColumn": 55,
                "originalEndLineNumber": 3,
                "originalEndColumn": 56,
                "modifiedStartLineNumber": 3,
                "modifiedStartColumn": 55,
                "modifiedEndLineNumber": 3,
                "modifiedEndColumn": 56,
                "originalText": "е",
                "modifiedText": "й"
            },
            {
                "originalStartLineNumber": 3,
                "originalStartColumn": 65,
                "originalEndLineNumber": 3,
                "originalEndColumn": 66,
                "modifiedStartLineNumber": 0,
                "modifiedStartColumn": 0,
                "modifiedEndLineNumber": 0,
                "modifiedEndColumn": 0,
                "originalText": "ы",
                "modifiedText": ""
            }
        ],
        "originalText": "// Все права защищены. Эта программа и сопроводительные материалы предоставляются ",
        "modifiedText": "// Все права защищены. Эта программа и сопроводительный материал предоставляются "
    },
    {
        "originalStartLineNumber": 22,
        "originalEndLineNumber": 23,
        "modifiedStartLineNumber": 21,
        "modifiedEndLineNumber": 0,
        "originalText": "//  ПутьКДанным - Строка - путь к данным (путь к реквизиту формы).\n//  Отказ - Булево - выходной параметр, всегда устанавливается в значение Истина.",
        "modifiedText": ""
    }
]
```
