# Функция *disableKeyBinding*
## Назначение функции
Отключает любое стандартное сочетание клавиш редактора

# Функция *enableKeyBinding*
## Назначение функции
Включает обратно сочетание

## Параметры функций
* **keybinding** - *integer*, результат ПОБИТОВОГО ИЛИ для сочетания кодов клавиш

## Коды клавиш
Все коды, кроме CTRL/ALT/SHIFT можно посмотреть [тут](https://microsoft.github.io/monaco-editor/api/enums/monaco.keycode)

key | KeyCode | 
-- | --
Ctrl |  2048
Alt |  512
Shift | 1024

## Пример
Например, для `ALT(512)+ArrowUp(16)` ПОБИТОВОЕ ИЛИ будет равно **528**.
Для `ALT(512)+ArrowDown(18)` ПОБИТОВОЕ ИЛИ будет равно **530**.

## Пример вызова для ALT+ArrowUp и ALT+ArrowDonw
```javascript
disableKeyBinding(528);
disableKeyBinding(530);
```

## Генерация события
После вызова при нажатии `ALT+ArrowUp` будет генерироваться событие `EVENT_KEY_BINDING_528`, а для `ALT+ArrowDown` -  `EVENT_KEY_BINDING_530`