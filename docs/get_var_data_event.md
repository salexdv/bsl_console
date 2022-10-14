# Событие *EVENT_GET_VARIABLE_DATA*

## Назначение события

Событие генерируется при расшифровке значения переменной в табло. См. [`showVariablesDescription`](show_var_description.md)

## Параметры события

* **variableId** - уникальный ключ (идентификатор) переменной, который ранее был передан в [`showVariablesDescription`](show_var_description.md)/[`updateVariableDescription`](upd_var_description.md)
* **variablePath** - путь для получения значение переменной
* **variableName** - имя переменной