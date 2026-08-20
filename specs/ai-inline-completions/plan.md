# ai-inline-completions: план реализации и решения

## План

1. Добавить изолированный AI inline-provider и unit-тесты его состояния.
2. Зарегистрировать его через native Monaco 0.55 API и связать с lifecycle редактора.
3. Опубликовать опции, callback, события и документацию для 1С.
4. Проверить браузерный lifecycle, production/single-file сборки и ES-floor.

## Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-08-20 | Сохранить протокол версии 1 из `7ce43a9` | Обратная совместимость обвязки 1С |
| 2026-08-20 | Использовать native `registerInlineCompletionsProvider` | В ветке `webpack` доступен штатный lifecycle Monaco 0.55 |
| 2026-08-20 | Использовать native cancellation token и команды `editor.action.inlineSuggest.*` | Не дублировать controller, renderer и обработку клавиш Monaco |
| 2026-08-20 | AI-provider уступает группе ручных inline-подсказок | `showInlineSuggestion` сохраняет приоритет и не запускает AI |
| 2026-08-20 | Debounce считать от `requestIssuedDateTime` | Не задерживать остальные native providers |
| 2026-08-20 | Мастер-опция выключена по умолчанию | Полная обратная совместимость |

Открытых вопросов нет.
