# Функция *updateSnippetByGUID*

## Назначение функции

Функция предназначена для обновления сниппета, при формировании кода которого произошел запрос метаданных. См.также [`EVENT_GET_METADATA`](get_metadata_event.md)

## Параметры функции

* **snippetGUID** - *string*, уникальный идентификатор сниппета из параметров события [`EVENT_GET_METADATA`](get_metadata_event.md)

## Пример вызова функции

```javascript
updateSnippetByGUID('a3d994c3-0e9b-404b-abdc-0c1576cd7442')
```
