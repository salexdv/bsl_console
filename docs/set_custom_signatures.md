# Функция *setCustomSignatures*
## Назначение функции
Функция позволяет задать пользовательские подсказки по вызову процедуры/метода

## Параметры функции
* **signutures** - *string*, подсказки в виде массив JSON-объектов, содержащих следующие поля:
	* [label](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.signatureinformation.html#label) - заголовок, содержащий параметры процедуры/функции
	* [documentation](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.signatureinformation.html#documentation) - описание сигнатуры
	* [parameters[]](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.signatureinformation.html#parameters) - массив параметров [ParameterInformation](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.parameterinformation.html)

## Особенности
В качестве ключа передается название процедуры/функции, для которой следует показать подсказку, а в качестве значения массив описанных выше объектов.	

## Пример вызова
```javascript
setCustomSignatures(`{
    "Состояние": [
        {
            "label": "(ТекстСообщения, Прогресс?)",
            "documentation": "Вывод текстового состояния с прогрессом",
            "parameters": [
                {
                    "label": "ТекстСообщения",
                    "documentation": "Строка, предназначенная для вывода в панель состояния. Если параметр не указан, возобновляется вывод системного текста в панель состояния."
                },
                {
                    "label": "Прогресс",
                    "documentation": "Число, Значение индикатора прогресса (от 1 до 100). Если не задан, индикатор прогресса не отображается."
                }
            ]
        },
        {
            "label": "(Прогресс, Картинка?, Пояснение?)",
            "documentation": "Вывод индикатора состояния с картинкой",
            "parameters": [
                {
                    "label": "Прогресс",
                    "documentation": "Число, Значение индикатора прогресса (от 1 до 100). Если не задан, индикатор прогресса не отображается."
                },
                {
                    "label": "Картинка",
                    "documentation": "Картинка для отображения в окне состояния"
                },
                {
                    "label": "Пояснение",
                    "documentation": "Строка, Текст пояснения."
                }
            ]
        }
    ]
}`);
```