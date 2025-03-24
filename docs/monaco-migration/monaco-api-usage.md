# Используемые API Monaco Editor в BSL Console

В этом документе собран список API Monaco Editor, используемых в проекте BSL Console. Эта информация поможет при миграции на новую версию Monaco Editor, позволяя сосредоточиться на API, которые могли измениться.

## Основные компоненты и API

### Модель редактора
- **monaco.editor.create()** - создание экземпляра редактора
- **editor.getModel()** - получение модели текста
- **editor.setValue()** / **editor.getValue()** - изменение и получение содержимого
- **model.getFullModelRange()** - получение полного диапазона модели
- **editor.getPosition()** - получение текущей позиции курсора
- **model.getLineCount()** - получение количества строк
- **model.getLineContent()** - получение содержимого строки

### Декорации и маркеры
- **editor.deltaDecorations()** - добавление/изменение декораций текста
- **monaco.editor.setModelMarkers()** - установка маркеров для модели
- **editor.updateDecorations()** - обновление декораций

### Виджеты и пользовательский интерфейс
- **IContentWidgetPosition** - позиционирование контентного виджета
- **editor.addContentWidget()** - добавление виджета в содержимое
- **editor.addOverlayWidget()** - добавление оверлей-виджета
- **ILineDecorations** - декорации для номеров строк

### События редактора
- **onDidChangeCursorPosition** - событие изменения позиции курсора
- **onDidChangeModelContent** - событие изменения содержимого
- **onDidPaste** - событие вставки текста (изменилось в новых версиях)
- **onCompositionStart/End** - события композиции (переименованы в новых версиях)

### Провайдеры языковых сервисов
- **monaco.languages.register()** - регистрация языка
- **monaco.languages.setMonarchTokensProvider()** - установка провайдера токенизации
- **monaco.languages.registerCompletionItemProvider()** - регистрация провайдера автодополнения
- **monaco.languages.registerSignatureHelpProvider()** - регистрация провайдера сигнатур функций
- **monaco.languages.registerHoverProvider()** - регистрация провайдера подсказок
- **monaco.languages.registerDefinitionProvider()** - регистрация провайдера определений
- **monaco.languages.registerDocumentFormattingEditProvider()** - регистрация форматирования
- **monaco.languages.registerFoldingRangeProvider()** - регистрация провайдера сворачивания кода
- **monaco.languages.registerCodeLensProvider()** - регистрация провайдера линз кода
- **monaco.languages.registerColorProvider()** - регистрация провайдера цветов

### Работа с темами
- **monaco.editor.defineTheme()** - определение пользовательской темы
- **monaco.editor.setTheme()** - установка активной темы

### Действия и команды
- **editor.addAction()** - добавление кастомного действия
- **editor.getAction().run()** - выполнение действия редактора
- **editor.trigger()** - вызов встроенных команд редактора

### Работа с diff-редактором
- **monaco.editor.createDiffEditor()** - создание diff редактора
- **diffEditor.setModel()** - установка модели для diff редактора
- **diffEditor.getOriginalEditor()** / **diffEditor.getModifiedEditor()** - получение оригинального и измененного редакторов
- **diffEditor.getDiffCount()** - получение количества различий
- **diffEditor.nextDiff()** / **diffEditor.previousDiff()** - навигация по различиям

### Опции редактора
- wordWrap
- readOnly
- lineNumbers
- automaticLayout
- minimap
- folding
- contextmenu
- quickSuggestions
- renderWhitespace
- fontSize / fontFamily / lineHeight

### Требующие внимания при миграции
1. **editor.deltaDecorations()** - в новых версиях рекомендуется использовать **IEditorDecorationsCollection**
2. **onCompositionStart/End** → **onDidCompositionStart/End**
3. Изменение аргумента, передаваемого в событие **onDidPaste**
4. Изменения в **WorkspaceEdit.edits** структуре
5. Изменения в **CompletionItemLabel**
6. Переименование **InlineHints** в **InlayHints**
7. Изменение API для токенизации
8. Изменения в API для редактора сравнения

## Важные конструкции для тестирования

При миграции особое внимание следует уделить следующим функциональным блокам:

1. **Подсветка синтаксиса BSL** (bsl_language.js)
2. **Автодополнение кода** (провайдеры в bsl_language.js)
3. **Сигнатуры функций** (signatureProvider)
4. **Подсказки при наведении** (hoverProvider)
5. **Работа с сворачиванием кода** (foldingProvider)
6. **Работа с цветовыми темами** (darkTheme, whiteTheme)
7. **Форматирование кода** (formatProvider)
8. **Работа с закладками и точками останова** (функции для bookmarks, breakpoints)
9. **Функции сравнения текста** (diffEditor)
10. **Работа в режиме запросов** (queryMode, автодополнение и подсветка для запросов)
