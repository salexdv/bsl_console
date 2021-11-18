# Функция *setOption*
## Назначение функции
Функция задает значение для опциональных настроек редактора.

## Параметры функции
* **optionName** - *string*, имя настройки
* **optionValue** - *variable*, значение настройки

## Пример вызова
```javascript
setOption("skipInsertSuggestionAcceptor", true);
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

##### Управление подсказками
Позволяет оставить только пользовательские подсказки
* `disableNativeSuggestions` - *boolean*, отключает стандартные подсказки
* `disableNativeSignatures` - *boolean*, отключает стандартные подсказки по вызову процедуры/функции
* `disableNativeHovers` - *boolean*, отключает стандартные всплывающие подсказки при наведении курсора мыши на слово
* `showSnippetsOnCustomSuggestions` - *boolean*, включает показ стандартных сниппетов при выводе пользовательских подсказок через [`showCustomSuggestions`](custom_suggestions.md)

##### Различные настройки редактора
* `skipInsertSuggestionAcceptor` - *boolean*, позволяет пропустить вставку символа, заданного функцией *setActiveSuggestionAcceptors* и вызвавшего выбор активного пункта подсказки
* `skipAcceptionSelectedSuggestion` - *boolean*, позволяет пропустить вставку текста активного пункта подсказки при нажатии символа, заданного функцией *setActiveSuggestionAcceptors*
* `disableContextCommands` - *boolean*, отключает формирование контекстного меню и привязку некоторых горячих клавиш, которые связаны с пунктами меню. Установка значения опции имеет смысл только до вызова функции инициализации `init()`
* `disableContextQueryConstructor` - *boolean*, отключает формирование кнопки контекстного меню "Конструктор запросов". Установка значения опции имеет смысл только до вызова `init()`
* `autoResizeEditorLayout` - *boolean*, включает перерисовку редактора при изменении размеров окна
* `renderQueryDelimiters` - *boolean*, включает выделение цветом разделителей запросов