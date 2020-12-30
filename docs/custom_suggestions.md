# Функция *showCustomSuggestions*
## Назначение функции
Функция показывает пользовательские подсказки в текущей позиции курсора

## Параметры функции
* **suggestions** - *string*, подсказки в виде JSON-объекта, содержащего следующие поля:
	* [name](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#label) - заголовок подсказки
	* [text](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#inserttext) - текст, вставляемый в редактор при выборе подсказки
	* [kind](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#kind) - одно из значений перечисления [CompletionItemKind](https://microsoft.github.io/monaco-editor/api/enums/monaco.languages.completionitemkind.html)
	* [detail](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#detail) - дополнительное описание элемента, показываемое в окне подсказок
	* [description](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#documentation) - документация к элементу

## Пример вызова
```javascript
showCustomSuggestions(`{
	"Подсказка1": {
		"name": "Подсказка №1",
		"text": "Подсказка №1 вставляемый текст",
		"kind": "Class",
		"detail": "Расширенная подсказка #1",
		"documentation": "Документация #1"
	},
	"Подсказка2": {
		"name": "Подсказка №2",
		"text": "Подсказка №2 ()",
		"kind": "Method",
		"detail": "Расширенная подсказка #2",
		"documentation": "Документация #2"
	}
}`);
```