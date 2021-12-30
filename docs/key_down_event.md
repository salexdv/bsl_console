# Событие *EVENT_ON_KEY_DOWN*

## Назначение события

Событие генерируется при нажатии на клавиатуру

## Управление событием

За генерацию события отвечает опция [`generateOnKeyDownEvent`](set_option.md). Через установку опции `onKeyDownFilter` можно дополнительно фильтровать события по коду клавиши. Все коды можно посмотреть [тут](https://microsoft.github.io/monaco-editor/api/enums/monaco.keycode)

## Пример вызова

```javascript
// Включение генерации события при нажатии любой клавиши
setOption('generateOnKeyDownEvent', true);

// Генерация события только при нажатии Esc и Enter
setOption('onKeyDownFilter', '9,3');

// Отключение генерации события
setOption('generateOnKeyDownEvent', false);
```

## Параметры события

* **keyCode** - код клавиши
* **suggestWidgetVisible** - видимость списка подсказок
* **parameterHintsWidgetVisible** - видимость подсказок параметров методов/функций
* **findWidgetVisible** - видимость поиска
* **ctrlPressed** - признак нажатой клавиши CTRL
* **altPressed** - признак нажатой клавиши ALT
* **shiftPressed** - признак нажатой клавиши SHIFT
* **position** - текущая позиция редактора

## Пример параметров генерируемого события

```json
{
  "keyCode": 9,
  "suggestWidgetVisible": false,
  "parameterHintsWidgetVisible": false,
  "findWidgetVisible": false,
  "ctrlPressed": false,
  "altPressed": false,
  "shiftPressed": false,
  "position": {
    "column": 1,
    "lineNumber": 2
  },
}
```