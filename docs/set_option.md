# Функция *setOption*
## Назначение функции
Функция задает значение для опциональных настроек редактора.

## Параметры функции
* **optionName** - *string*, имя настройки
* **optionValue** - *variable*, значение настройки

## Пример вызова
```javascript
setOption("skipInsertSuggestionAcceptor", true);

// Включение запросов AI inline-подсказок через события 1С
setOption("generateAIInlineCompletionEvent", true);
```

## Список опциональных настроек
##### Управление событиями
* `generateModificationEvent` - *boolean*, включает/отключает генерацию [события](modification_event.md) при любом изменении содержимого редактора
* `generateBeforeShowSuggestEvent` - *boolean*, включает/отключает генерацию [события](before_suggest_event.md) перед появлением списка подсказок
* `generateSuggestActivationEvent` - *boolean*, включает/отключает генерацию [события](activation_event.md) при активации пункта в текущем списке подсказок
	* `alwaysDisplaySuggestDetails` - *boolean*, управляет постоянным отображением детальной информации в списке подсказок (работает только при включенной опции `generateSuggestActivationEvent`)
* `generateSelectSuggestEvent` - *boolean*, включает/отключает генерацию [события](select_suggest_event.md) при выборе пункта из списка подсказок
* `generateBeforeHoverEvent` - *boolean*, включает/отключает генерацию [события](before_hover_event.md) перед появлением всплывающей подсказки для слова при наведении мыши
* `generateBeforeSignatureEvent` - *boolean*, включает/отключает генерацию [события](before_signature_event.md) перед появлением всплывающей подсказки по вызову процедуры/метода
* `generateDefinitionEvent` - *boolean*, включает генерацию [события](get_definition_event.md) при переходе к определению
* `generateGetHelpEvent` - *boolean*, включает генерацию [события](get_help_event.md) при запросе справки по `CTRL+F1`
* `generateOnKeyDownEvent` - *boolean*, включает генерацию [события](key_down_event.md) при нажатии на клавиатуру
	* `onKeyDownFilter` - *string*, дополнительный фильтр по кодам клавиш
* `generateSnippetEvent` - *boolean*, включает генерацию [события](insert_snippet_event.md) при вставке сниппета
* `generateCompareCompleteEvent` - *boolean*, включает генерацию [события](compare_complete_event.md) при завершения сравнения
* `generateAIInlineCompletionEvent` - *boolean*, включает запросы [AI inline-подсказок](ai_inline_completions.md) через события 1С. Значение по умолчанию — `false`. При отключении ожидающий запрос отменяется, а активная inline-подсказка скрывается

##### Управление подсказками
Позволяет оставить только пользовательские подсказки
* `disableNativeSuggestions` - *boolean*, отключает стандартные подсказки
* `disableNativeSignatures` - *boolean*, отключает стандартные подсказки по вызову процедуры/функции
* `disableNativeHovers` - *boolean*, отключает стандартные всплывающие подсказки при наведении курсора мыши на слово
* `disableNativeCodeAction` - *boolean*, отключает стандартные подсказки по форматированию кода
* `showSnippetsOnCustomSuggestions` - *boolean*, включает показ стандартных сниппетов при выводе пользовательских подсказок через [`showCustomSuggestions`](custom_suggestions.md)
* `aiInlineCompletionDebounceMs` - *number*, задержка автоматического AI-запроса после последней правки, мс. Значение по умолчанию — `400`
* `aiInlineCompletionRequestTimeoutMs` - *number*, время ожидания ответа 1С, мс. Значение по умолчанию — `15000`
* `aiInlineCompletionMaxPrefixChars` - *number*, максимальное число символов контекста перед курсором. Значение по умолчанию — `16000`
* `aiInlineCompletionMaxSuffixChars` - *number*, максимальное число символов контекста после курсора. Значение по умолчанию — `4000`

Числовые настройки должны быть целыми неотрицательными числами, а `aiInlineCompletionRequestTimeoutMs` — положительным числом. Невалидное значение не применяется.

##### Различные настройки редактора
* `skipInsertSuggestionAcceptor` - *boolean*, позволяет пропустить вставку символа, заданного функцией *setActiveSuggestionAcceptors* и вызвавшего выбор активного пункта подсказки
* `skipAcceptionSelectedSuggestion` - *boolean*, позволяет пропустить вставку текста активного пункта подсказки при нажатии символа, заданного функцией *setActiveSuggestionAcceptors*
* `disableContextCommands` - *boolean*, отключает формирование контекстного меню и привязку некоторых горячих клавиш, которые связаны с пунктами меню. Установка значения опции имеет смысл только до вызова функции инициализации `init()`
* `disableContextQueryConstructor` - *boolean*, отключает формирование кнопки контекстного меню "Конструктор запросов". Установка значения опции имеет смысл только до вызова `init()`
* `autoResizeEditorLayout` - *boolean*, включает перерисовку редактора при изменении размеров окна
* `renderQueryDelimiters` - *boolean*, включает выделение цветом разделителей запросов
* `disableDefinitionMessage` - *boolean*, отключает показ сообщения `Определение для ххх не найдено` при переходе к определению по F12 или CTRL+F12
* `disableFolding` - *boolean*, отключает сворачивание блоков кода
* `allowRevertBack` - *boolean*, включает/отключает возможность поблочного отката изменений в режиме сравнения
* `highlightInnerQuotes` - *boolean*, включает/отключает подсветку экранированных двойных кавычек `""` внутри строк
* `showDiffDecorations` - *boolean*, включает/отключает отображение различий при использовании функции [`setOriginalText`](set_original_text.md). Значение по умолчанию `true`
