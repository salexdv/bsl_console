/**
 * Класс SnippetsParser является копией класса StreamParser из библиотеки
 * StreamLib для проекта "Снегопат", но дополнительно включает себя некоторые
 * доработки по адаптации стандартных шаблонов 1С:Предприятия (*.st) под формат
 * сниппетов VSCode https://code.visualstudio.com/docs/editor/userdefinedsnippets
 * 
 * Автор оригинальной библиотеки: Александр Кунташов
 * Ссылки на библиотеку: https://snegopat.ru/scripts/file?name=Libs/StreamLib.js
 * https://snegopat.ru/scripts/file?name=snippets.js
 */
class SnippetsParser {

    constructor() {

        this.setStream('');
        this._snippets = {};

    }

    setStream(stream) {

        this._stream = stream;
        this.pos = 0;
        this.len = this._stream.length;

    }

    getStream() {

        return this._stream;

    }

    getSnippets() {

        return this._snippets;

    }

    _loadStElement(stElement) {

        let elProps = stElement[1];

        if (elProps[1] == 1) {
            // Это группа.
            for (let i = 2; i < stElement.length; i++)
                this._loadStElement(stElement[i]);
        }
        else {
            // Это элемент.
            this._addSnippet(elProps);
        }

    }

    _convertPlaceholder(placeholder) {

        // Преобразование шаблона выполняется только тогда, когда в шаблоне больше одного параметра.
        // Например, <?"Выберите директиву компиляции", ВыборВарианта, "НаКлиенте", "НаСервере">
        // или так <?"Выберите справочник", Справочник>
        let template_arr = placeholder.split(',');
        let separator = ':';
        let fix_placeholder = false;

        if (1 < template_arr.length) {

            let action = template_arr[1].trim();

            if (action == 'ВыборВарианта') {

                template_arr = template_arr.slice(2);
                placeholder = '';
                let options = [];

                template_arr.forEach((value, index) => {
                    if ((index + 1) % 2 == 0) {
                        let option = value.replace(/"/g, '').trim();
                        option = option.replace(/"@0"/g, '').replace(/@0/g, '');
                        if (option)
                            options.push(option);
                    }
                });

                placeholder = '|' + options.join() + '|';
                separator = '';

            }
            else if (action == 'ДатаВремя') {
                placeholder = '${CURRENT_DATE}.${CURRENT_MONTH}.${CURRENT_YEAR} ${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}';
                fix_placeholder = true;
            }
            else if (action == 'ОбъектМетаданных') {

                template_arr = template_arr.slice(2);
                let options = [];

                template_arr.forEach((value) => {
                    let option = value.replace(/"/g, '').trim();
                    if (option.indexOf('.') == -1 && options.indexOf(option) == -1)
                        options.push(option);
                });

                if (options.length)
                    if (options.length == 1)
                        placeholder = options[0];
                    else
                        placeholder = 'ОбъектМетаданных:' + options.join();
                else
                    placeholder = action;

            }
            else {
                placeholder = action;
            }

        }

        return {
            template: placeholder,
            separator: separator,
            fix_placeholder: fix_placeholder
        };

    }

    _convertSnippet(stElement) {

        let snippet = null;
        let description = stElement[0];
        let prefix = stElement[3];
        let template = stElement[4];

        if (template && description) {

            // Конвертация конструкции <? в <<, чтобы избежать трудностей с регулярными выражениями
            let regexp = RegExp('<\\?', 'gmi');
            template = template.replace(regexp, '<<');

            // Поиск позиции выхода из шаблона и замена её на @0
            template = template.replace(/<<>/gmi, '@0');

            // Поиск всех значащих блоков <? и замена их на @{
            regexp = RegExp('<<"?(.*?)"?>', 'gmi');
            let match = null;
            let placeholder_index = 1;

            while ((match = regexp.exec(template)) !== null) {
                let text = match[0];
                // Экранирование т.к. в некоторых шаблонах могут быть спецсимволы
                text = text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                let replace_reg = RegExp(text, 'gmi');
                // Преобразование шаблона при необходимости
                let placeholder = this._convertPlaceholder(match[1]);
                if (placeholder.fix_placeholder) {
                    template = template.replace(replace_reg, placeholder.template);
                }
                else {
                    let prev_template = template;
                    template = template.replace(replace_reg, '@{' + placeholder_index + placeholder.separator + placeholder.template + '}');
                    if (template == prev_template)
                        break;
                    placeholder_index++;
                }
                regexp.lastIndex = 0;
            }

            // Окончательная замена номеров блоков с @{n или @0 на ${n
            regexp = RegExp('(\\@{?)((?:\\d{1,}|.+}))', 'gmi');
            while ((match = regexp.exec(template)) !== null) {
                let block = match[1].replace('@', '$') + match[2];
                template = template.substring(0, match.index) + block + template.substring(match.index + match[0].length);
            }

            snippet = {
                prefix: prefix,
                description: description,
                template: template
            }

        }

        return snippet;
    }

    _addSnippet(stElement) {

        let snippet = this._convertSnippet(stElement);

        if (snippet) {

            let key = snippet.description;

            if (this._snippets[key])
                key += snippet.prefix;

            this._snippets[key] = {
                "prefix": snippet.prefix,
                "body": snippet.template,
                "description": snippet.description
            }
        }

    }

    parse() {

        try {
            let arr = this._parse();

            if (arr)
                this._loadStElement(arr[1]);

        }
        catch (e) {
            this._logError(e);
            return null;
        }

    }

    _parse() {

        if (!this.atEnd()) {
            if (this.isEquals('{'))
                return this.readArray();

            this.errorSyntaxError('_parse:1');
        }

        this.errorUnexpectedEndOfStream('_parse:2');

    }

    readArray() {

        let a = [];

        while (this.next()) {
            if (this.isEquals('{')) {
                a.push(this.readArray())
            }
            else if (this.isEquals('}')) {
                return a;
            }
            else if (this.isEquals('"')) {
                a.push(this.readString());
            }
            else if (this.isNumber()) {
                a.push(this.readNumber());
            }
            else if (this.isEquals(',') || this.isSpace()) {
                // TODO: проверять ошибку: две подряд идущие запятые.
            }
            else {
                this.errorSyntaxError('readArray:1');
            }
        }

        this.errorUnexpectedEndOfStream('readArray:2');

    }

    readNumber() {

        let num = this.charAt(this.pos);

        while (this.next()) {
            if (this.isNumber()) {
                num += this.charAt(this.pos);
            }
            else if (this.isEquals(',') || this.isEquals('}')) {
                this.pos--;
                return 1 * num; // Преобразуем к числу.
            }
            else {
                this.errorSyntaxError('readNumber:1', 'цифра');
            }
        }
        this.errorUnexpectedEndOfStream('readNumber:2');

    };

    readString() {

        let str = '';

        while (this.next()) {
            if (this.isEquals('"')) {
                if (!this.next())
                    this.errorUnexpectedEndOfStream('readString:1');

                /* Проверим следующий символ после кавычки. В синтаксически верном файле потока
                следующим символом может быть: еще одна ковычка - это означает экранированную кавычку,
                запятая или закрывающая фигурная скобка или несколько пробельных символов, а потом 
                запятая или закрывающая фигурная скобка - это значит строка закончилась. */
                if (this.isEquals('"')) {
                    str += '"';
                }
                else {
                    while (this.isSpace() && this.next())
                        ; // Пропускаем пробельные символы.

                    if (this.atEnd())
                        this.errorUnexpectedEndOfStream('readString:3');

                    if (this.isEquals(',') || this.isEquals('}')) {
                        this.pos--;
                        return str;
                    }

                    this.errorSyntaxError('readString:4');
                }
            }
            else {
                str += this.charAt(this.pos);
            }
        }
        this.errorUnexpectedEndOfStream('readString:5');

    }

    atEnd() {

        return (this.pos == this.len);

    };

    next() {

        this.pos++;
        return !this.atEnd();

    };

    charAt(index) {

        return this._stream.charAt(index);

    };

    isEquals(ch) {

        if (this.atEnd())
            return false;

        return (ch == this.charAt(this.pos))

    };

    isSpace() {

        let ch = this.charAt(this.pos);
        return (ch == ' ' || ch == "\t" || ch == "\r" || ch == "\n");

    };

    isNumber() {

        let ch = this.charAt(this.pos);
        return ch == '0' || ch == '1' || ch == '2' || ch == '3' || ch == '4'
            || ch == '5' || ch == '6' || ch == '7' || ch == '8' || ch == '9';

    }

    errorSyntaxError(methodId) {

        let desc = this._methodIdRepr(methodId)
            + "Ошибка разбора потока: синтаксическая ошибка в позиции [" + this.pos + "]: "
            + this._getErrorContext();

        this._logError(desc);

        throw new _StreamParserSyntaxErrorException(desc, this.pos, methodId);

    }

    errorUnexpectedEndOfStream(methodId) {

        let desc = this._methodIdRepr(methodId) + "Ошибка разбора потока: Неожиданный конец потока!";

        this._logError(desc);

        throw new _StreamParserUnexpectedEndOfStreamExeption(desc, methodId);

    }

    /* Возвращает контекст ошибки: строку, в которой произошла ошибки и строки выше и ниже
    этой строки. Перед позицией, в которой обнаружена ошибка будет добавлен маркер '<!>', 
    выделенный дополнительно пробелами слева и справа (по одному пробелу). */
    _getErrorContext() {

        let linesBefore = 1;
        let linesAfter = 1;

        let context = ' <!> '; // Маркер позиции ошибки.

        // Символы левее ошибки, включая одну строку выше строки с ошибкой.
        for (let i = this.pos - 1; linesBefore >= 0 && i >= 0; i--) {
            let ch = this.charAt(i);
            context = ch + context;

            if (ch == "\n")
                linesBefore--;
        }

        // Символы правее ошибки, включая одну строку ниже строки с ошибкой.
        for (let i = this.pos; linesAfter >= 0 && i < this.len; i++) {
            let ch = this.charAt(i);
            context = context + ch;

            if (ch == "\n")
                linesAfter--;
        }

        return context;
    }

    _methodIdRepr(methodId) {
        return (methodId ? ("[" + methodId + "]: ") : "");
    }

    _logError(message) {
        console.log('StreamParser: ' + message);
    }

}