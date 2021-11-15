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
* `skipInsertSuggestionAcceptor` - *boolean*, позволяет пропустить вставку символа, заданного функцией *setActiveSuggestionAcceptors* и вызвавшего выбор активного пункта подсказки
* `skipAcceptionSelectedSuggestion` - *boolean*, позволяет пропустить вставку текста активного пункта подсказки при нажатии символа, заданного функцией *setActiveSuggestionAcceptors*
* `disableContextCommands` - *boolean*, отключает формирование контекстного меню и привязку некоторых горячих клавиш, которые связаны с пунктами меню. Установка значения опции имеет смысл только до вызова функции инициализации `init()`
* `disableContextQueryConstructor` - *boolean*, отключает формирование кнопки контекстного меню "Конструктор запросов". Установка значения опции имеет смысл только до вызова `init()`
* `autoResizeEditorLayout` - *boolean*, включает перерисовку редактора при изменении размеров окна
* `renderQueryDelimiters` - *boolean*, включает выделение цветом разделителей запросов
* `generateDefinitionEvent` - *boolean*, включает генерацию [события](get_definition_event.md) при переходе к определению

	##### Управление подсказками
	Позволяет оставить только пользовательские подсказки
* `disableNativeSuggestions` - *boolean*, отключает стандартные подсказки
* `disableNativeSignatures` - *boolean*, отключает стандартные подсказки по вызову процедуры/функции
* `disableNativeHovers` - *boolean*, отключает стандартные всплывающие подсказки при наведении курсора мыши на слово
* `showSnippetsOnCustomSuggestions` - *boolean*, включает показ стандартных сниппетов при выводе пользовательских подсказок через [`showCustomSuggestions`](custom_suggestions.md)