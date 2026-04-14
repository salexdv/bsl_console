# Функция *showCustomSuggestions*
## Назначение функции
Функция показывает пользовательские подсказки в текущей позиции курсора. Поддерживает как обычные пункты, вставляющие текст в редактор, так и специальные пункты, генерирующие пользовательское событие.

## Параметры функции
* **suggestions** - *string*, подсказки в виде JSON-объекта, содержащего следующие поля:
	* [name](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#label) - заголовок подсказки
	* [text](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#inserttext) - текст, вставляемый в редактор при выборе подсказки
	* [kind](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#kind) - одно из значений перечисления [CompletionItemKind](https://microsoft.github.io/monaco-editor/api/enums/monaco.languages.completionitemkind.html)
	* [detail](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#detail) - дополнительное описание элемента, показываемое в окне подсказок
	* [documentation](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#documentation) - документация к элементу
	* [filter](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#filtertext) - текст, используемый для фильтрации. Необязательно поле.
	* [sort](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.completionitem.html#sorttext) - строка, используемая для сортировки элемента в списке. Необязательно поле.
	* **event** - *string*, имя пользовательского события. Если поле заполнено, при выборе текст не вставляется, вместо этого генерируется событие с указанным именем
	* **codicon** - *string*, CSS-класс иконки Codicon, например `codicon-run` или `codicon-symbol-event`. Необязательное поле. Если для специального элемента не задано, используется `codicon-symbol-event`. Список доступных иконок можно посмотреть [тут](./codicons_list.md)

## Пункты с пользовательскими событиями

Если у элемента задано поле **event**, он отображается особым образом в списке подсказок и при выборе генерирует событие, при этом значение поля **text** в редактор не вставляется.

### Пример вызова

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
		"name": "Выполнить действие",
		"text": "",
		"kind": "",
		"event": "EVENT_MY_CUSTOM_EVENT",
		"detail": "Специальный пункт",
		"documentation": "При выборе будет сгенерировано событие",
		"codicon": "codicon-symbol-event"
	}
}`);
```

### Пример параметров генерируемого события EVENT_MY_CUSTOM_EVENT

```json
{
  "current_word": "",
  "last_word": "авансовыйотчет",
  "last_expression": "документы.авансовыйотчет.",
  "position": {
    "lineNumber": 17,
    "column": 54
  }
}
```

## Пример вызова обычных подсказок
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
