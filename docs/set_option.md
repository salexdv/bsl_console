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

	##### Управление подсказками
	Позволяет оставить только пользовательские подсказки
* `disableNativeSuggestions` - *boolean*, отключает стандартные подсказки
* `disableNativeSignatures` - *boolean*, отключает стандартные подсказки по вызову процедуры/функции
* `disableNativeHovers` - *boolean*, отключает стандартные всплывающие подсказки при наведении курсора мыши на слово