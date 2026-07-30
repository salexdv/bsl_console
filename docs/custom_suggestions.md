# Функция *showCustomSuggestions*

## Назначение функции

Функция показывает пользовательские подсказки в текущей позиции курсора. Поддерживает обычные
пункты, вставляющие текст в редактор, и специальные пункты, генерирующие пользовательское событие.

## Параметры функции

* **suggestions** — *string*, подсказки в виде JSON-объекта, содержащего следующие поля:
  * [name](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#label) — заголовок подсказки;
  * [text](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#insertText) — текст, вставляемый в редактор при выборе подсказки;
  * [kind](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#kind) — одно из значений перечисления [CompletionItemKind](https://microsoft.github.io/monaco-editor/typedoc/enums/languages.CompletionItemKind.html);
  * [detail](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#detail) — дополнительное описание элемента;
  * [documentation](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#documentation) — документация к элементу;
  * [filter](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#filterText) — текст для фильтрации, необязательное поле;
  * [sort](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#sortText) — строка для сортировки, необязательное поле;
  * [preselect](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItem.html#preselect) — признак предварительного выбора элемента в списке подсказок. Необязательное поле. Только один элемент списка может иметь `preselect: true`;
  * **event** — *string*, имя пользовательского события. Если поле заполнено, текст не вставляется,
    вместо этого генерируется событие с указанным именем;
  * **codicon** — *string*, CSS-класс иконки Codicon, например `codicon-run` или
    `codicon-symbol-event`. Необязательное поле. Для специального пункта без иконки используется
    `codicon-symbol-event`. Доступные классы перечислены в [списке Codicon](./codicons_list.md).

## Пункты с пользовательскими событиями

Если у элемента задано поле **event**, он отображается особым образом и при выборе генерирует
событие. Значение поля **text** в редактор не вставляется.

### Пример вызова

```javascript
showCustomSuggestions(`{
  "Подсказка1": {
    "name": "Подсказка №1",
    "text": "Подсказка №1 вставляемый текст",
    "kind": "Class",
    "detail": "Расширенная подсказка #1",
    "documentation": "Документация #1",
    "preselect": true
  },
  "Подсказка2": {
    "name": "Выполнить действие",
    "text": "",
    "kind": "Event",
    "event": "EVENT_MY_CUSTOM_EVENT",
    "detail": "Специальный пункт",
    "documentation": "При выборе будет сгенерировано событие",
    "codicon": "codicon-symbol-event"
  }
}`);
```

### Параметры события `EVENT_MY_CUSTOM_EVENT`

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

## Пример обычных подсказок

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
    "documentation": "Документация #2",
    "codicon": "codicon-run",
    "preselect": true
  }
}`);
```
