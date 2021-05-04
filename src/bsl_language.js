define([], function () {

    let themes = {
        rules: {
            white: [
                { token: 'commentbsl', foreground: '008000' },
                { token: 'keywordbsl', foreground: 'ff0000' },
                { token: 'delimiterbsl', foreground: 'ff0000' },
                { token: 'delimiter.squarebsl', foreground: 'ff0000' },
                { token: 'delimiter.parenthesisbsl', foreground: 'ff0000' },
                { token: 'identifierbsl', foreground: '0000ff' },
                { token: 'stringbsl', foreground: '000000' },
                { token: 'string.quotebsl', foreground: '000000' },
                { token: 'string.invalidbsl', foreground: '000000' },
                { token: 'numberbsl', foreground: '000000' },
                { token: 'number.floatbsl', foreground: '000000' },
                { token: 'preprocbsl', foreground: '963200' }
            ],
            whiteQueryOn: [
                { token: 'querybsl', foreground: '000000' },                    
                { token: 'query.quotebsl', foreground: '000000' },
                { token: 'query.stringbsl', foreground: 'df0000' },
                { token: 'query.keywordbsl', foreground: '0000ff' },
                { token: 'query.expbsl', foreground: 'a50000' },
                { token: 'query.parambsl', foreground: '007b7c' },                    
                { token: 'query.bracketsbsl', foreground: '0000ff' },
                { token: 'query.operatorbsl', foreground: '0000ff' },
                { token: 'query.floatbsl', foreground: 'ff00ff' },
                { token: 'query.intbsl', foreground: 'ff00ff' },
                { token: 'query.commentbsl', foreground: '008000' }
            ],
            dark: [
                { background: '1e1e1e' },
                { token: 'commentbsl', foreground: '6A9955' },
                { token: 'keywordbsl', foreground: '499caa' },
                { token: 'delimiterbsl', foreground: 'd4d4d4' },
                { token: 'delimiter.squarebsl', foreground: 'd4d4d4' },
                { token: 'delimiter.parenthesisbsl', foreground: 'd4d4d4' },
                { token: 'identifierbsl', foreground: 'd4d4d4' },
                { token: 'stringbsl', foreground: 'c3602c' },
                { token: 'string.quotebsl', foreground: 'c3602c' },
                { token: 'string.invalidbsl', foreground: 'c3602c' },
                { token: 'numberbsl', foreground: 'b5cea8' },
                { token: 'number.floatbsl', foreground: 'b5cea8' },
                { token: 'preprocbsl', foreground: '963200' }                
            ],
            darkQueryOff: [
                { token: 'querybsl', foreground: 'c3602c' },                    
                { token: 'query.quotebsl', foreground: 'c3602c' },
                { token: 'query.stringbsl', foreground: 'c3602c' },
                { token: 'query.keywordbsl', foreground: 'c3602c' },
                { token: 'query.expbsl', foreground: 'c3602c' },
                { token: 'query.parambsl', foreground: 'c3602c' },                    
                { token: 'query.bracketsbsl', foreground: 'c3602c' },
                { token: 'query.operatorbsl', foreground: 'c3602c' },
                { token: 'query.floatbsl', foreground: 'c3602c' },
                { token: 'query.intbsl', foreground: 'c3602c' },
                { token: 'query.commentbsl', foreground: 'c3602c' }
            ],
            darkQueryOn: [
                { token: 'querybsl', foreground: 'e7db6a' },                    
                { token: 'query.quotebsl', foreground: 'e7db6a' },
                { token: 'query.stringbsl', foreground: 'ff4242' },
                { token: 'query.keywordbsl', foreground: 'f92472' },
                { token: 'query.expbsl', foreground: 'a50000' },
                { token: 'query.parambsl', foreground: '007b7c' },                    
                { token: 'query.bracketsbsl', foreground: 'd4d4d4' },
                { token: 'query.operatorbsl', foreground: 'd4d4d4' },
                { token: 'query.floatbsl', foreground: 'ff00ff' },
                { token: 'query.intbsl', foreground: 'ff00ff' },
                { token: 'query.commentbsl', foreground: '6a9955' }
            ]
        },
        colors: {
            dark: {
                'foreground': '#d4d4d4',
                'editor.background': '#1e1e1e',
                'editor.selectionBackground': '#062f4a',
                'editor.selectionHighlightBackground': '#495662',
                'editorCursor.foreground': '#d4d4d4',
                'editorSuggestWidget.background': '#252526',
                'editorSuggestWidget.foreground': '#d4d4d4',
                'editorSuggestWidget.selectedBackground': '#062f4a',
                'editorWidget.background': '#252526',
                'editorWidget.foreground': '#d4d4d4',
                'editorWidget.border': '#d4d4d4'                
            },
            white: {
                'editor.selectionBackground': '#ffe877',
                'editor.selectionHighlightBackground': '#fef6d0'
            }
        }
    }

    let bsl_language = {

        id: 'bsl',
        rules: {
            defaultToken: '',
            tokenPostfix: 'bsl',
            ignoreCase: true,
            brackets: [
                { open: '[', close: ']', token: 'delimiter.square' },
                { open: '(', close: ')', token: 'delimiter.parenthesis' },
            ],
            keywords: [
                'КонецПроцедуры', 'EndProcedure', 'КонецФункции', 'EndFunction',
                'Прервать', 'Break', 'Продолжить', 'Continue', 'Возврат', 'Return',
                'Если', 'If', 'Иначе', 'Else', 'ИначеЕсли', 'ElsIf', 'Тогда', 'Then',
                'КонецЕсли', 'EndIf', 'Попытка', 'Try', 'Исключение', 'Except',
                'КонецПопытки', 'EndTry', 'Raise', 'ВызватьИсключение', 'Пока',
                'While', 'Для', 'For', 'Каждого', 'Each', 'Из', 'In', 'По', 'To', 'Цикл',
                'Do', 'КонецЦикла', 'EndDo', 'НЕ', 'NOT', 'И', 'AND', 'ИЛИ', 'OR', 'Новый',
                'New', 'Процедура', 'Procedure', 'Функция', 'Function', 'Перем', 'Var',
                'Экспорт', 'Export', 'Знач', 'Val', 'Неопределено', 'Выполнить',
                'Истина', 'Ложь', 'True', 'False', 'Undefined'
            ],
            namespaceFollows: [
                'namespace', 'using',
            ],
            parenFollows: [
                'if', 'for', 'while', 'switch', 'foreach', 'using', 'catch', 'when'
            ],
            operators: ['=', '<=', '>=', '<>', '<', '>', '+', '-', '*', '/', '%'],
            symbols: /[=><!~?:&+\-*\/\^%]+/,
            // escape sequences
            escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
            queryWords: [
                'ВЫБРАТЬ', 'РАЗРЕШЕННЫЕ', 'РАЗЛИЧНЫЕ', 'ПЕРВЫЕ', 'КАК', 'ПУСТАЯТАБЛИЦА', 'ПОМЕСТИТЬ',
                'ИЗ', 'ВНУТРЕННЕЕ', 'ЛЕВОЕ', 'ВНЕШНЕЕ', 'ПРАВОЕ', 'ПОЛНОЕ', 'СОЕДИНЕНИЕ',
                'ГДЕ', 'СГРУППИРОВАТЬ', 'ПО', 'ИМЕЮЩИЕ', 'ОБЪЕДИНИТЬ', 'ВСЕ', 'УПОРЯДОЧИТЬ',
                'АВТОУПОРЯДОЧИВАНИЕ', 'ИТОГИ', 'ОБЩИЕ', 'ТОЛЬКО', 'ИЕРАРХИЯ', 'ПЕРИОДАМИ', 'ДЛЯ',
                'ИЗМЕНЕНИЯ', 'SELECT', 'ALLOWED', 'DISTINCT', 'TOP', 'AS', 'EMPTYTABLE',
                'INTO', 'FROM', 'INNER', 'LEFT', ' OUTER', 'RIGHT', 'FULL',
                'JOIN', 'ON', 'WHERE', 'GROUP', 'BY', 'HAVING', 'UNION',
                'ALL', 'ORDER', 'AUTOORDER', 'TOTALS', 'OVERALL', 'ONLY', 'HIERARCHY',
                'СГРУППИРОВАНОПО', 'GROUPEDBY', 'БУЛЕВО', 'BOOLEAN', 'ВОЗР', 'ASC',
                'ЗНАЧЕНИЕ', 'VALUE', 'ИНДЕКСИРОВАТЬ', 'INDEX', 'ТИП', 'TYPE', 'ТИПЗНАЧЕНИЯ',
                'VALUETYPE', 'УБЫВ', 'DESC', 'УНИЧТОЖИТЬ', 'DROP'
            ],
            queryWords_8_3_16: [
                'ГРУППИРУЮЩИМ', 'НАБОРАМ', 'GROUPING', 'SETS'
            ],
            queryExp: [
                'АВТОНОМЕРЗАПИСИ', 'RECORDAUTONUMBER', 'В', 'IN', 'ВЫБОР', 'CASE',
                'ВЫРАЗИТЬ', 'CAST', 'ГОД', 'YEAR', 'ДАТА', 'DATE', 'ДАТАВРЕМЯ',
                'DATETIME', 'ДЕКАДА', 'TENDAYS', 'ДЕНЬ', 'DAY', 'ДЕНЬГОДА',
                'DAYOFYEAR', 'ДЕНЬНЕДЕЛИ', 'WEEKDAY', 'ДОБАВИТЬКДАТЕ', 'DATEADD',
                'ЕСТЬ', 'IS', 'ЕСТЬNULL', 'ISNULL', 'И', 'AND', 'ИЕРАРХИИ',
                'HIERARCHY', 'ИЛИ', 'OR', 'ИНАЧЕ', 'ELSE', 'ИСТИНА', 'TRUE',
                'КВАРТАЛ', 'QUARTER', 'КОЛИЧЕСТВО', 'COUNT', 'КОНЕЦПЕРИОДА',
                'ENDOFPERIOD', 'КОНЕЦ', 'END', 'ЛОЖЬ', 'FALSE', 'МАКСИМУМ',
                'MAX', 'МЕЖДУ', 'BETWEEN', 'МЕСЯЦ', 'MONTH', 'МИНИМУМ', 'MIN',
                'МИНУТА', 'MINUTE', 'НАЧАЛОПЕРИОДА', 'BEGINOFPERIOD', 'НЕ', 'NOT',
                'НЕДЕЛЯ', 'WEEK', 'НЕОПРЕДЕЛЕНО', 'UNDEFINED', 'ПОДОБНО', 'LIKE',
                'ПОДСТРОКА', 'SUBSTRING', 'ПОЛУГОДИЕ', 'HALFYEAR', 'ПРЕДСТАВЛЕНИЕ',
                'PRESENTATION', 'ПРЕДСТАВЛЕНИЕССЫЛКИ', 'REFPRESENTATION',
                'РАЗНОСТЬДАТ', 'DATEDIFF', 'СЕКУНДА', 'SECOND', 'СПЕЦСИМВОЛ',
                'ESCAPE', 'СРЕДНЕЕ', 'AVG', 'ССЫЛКА', 'REFS', 'СТРОКА', 'STRING',
                'СУММА', 'SUM', 'ТОГДА', 'THEN', 'УБЫВ', 'DESC', 'ЧАС', 'HOUR',
                'ЧИСЛО', 'NUMBER', 'NULL', 'КОГДА', 'WHEN'
            ],
            queryExp_8_3_20: [
                'СТРОКА', 'STRING', 'СОКРЛП', 'TRIMALL', 'СОКРП', 'TRIMAR', 'СОКРЛ', 'TRIMAL',
                'ACOS', 'ASIN', 'ATAN', 'COS', 'EXP', 'LOG', 'LOG10', 'SIN', 'SQRT', 'POW',
                'TAN', 'ОКР', 'ROUND', 'ЦЕЛ', 'INT', 'ДЛИНАСТРОКИ', 'STRINGLENGTH', 'ЛЕВ',
                'LEFT', 'ПРАВ', 'RIGHT', 'СТРНАЙТИ', 'STRFIND', 'ВРЕГ', 'UPPER', 'НРЕГ',
                'LOWER', 'СТРЗАМЕНИТЬ', 'STRREPLACE', 'РАЗМЕРХРАНИМЫХДАННЫХ', 'STOREDDATASIZE'
            ],
            DCSExp: [
                'ВЫБОР', 'CASE', 'КОГДА', 'WHEN', 'ТОГДА', 'THEN', 'ИЛИ', 'OR',
                'ИНАЧЕ', 'ELSE', 'ИСТИНА', 'TRUE', 'КОНЕЦ', 'END', 'ЛОЖЬ', 'FALSE'
            ],
            DCSFunctions: [
                'ВЫЧИСЛИТЬ', 'EVAL', 'ВЫЧИСЛИТЬВЫРАЖЕНИЕ', 'EVALEXPRESSION',
                'ВЫЧИСЛИТЬВЫРАЖЕНИЕСГРУППИРОВКОЙМАССИВ', 'EVALEXPRESSIONWITHGROUPARRAY',
                'ВЫЧИСЛИТЬВЫРАЖЕНИЕСГРУППИРОВКОЙТАБЛИЦАЗНАЧЕНИЙ', 'EVALEXPRESSIONWITHGROUPVALUETABLE',
                'СТРОКА', 'STRING', 'ACOS', 'ASIN', 'ATAN', 'COS', 'EXP', 'LOG', 'LOG10', 'SIN',
                'SQRT', 'POW', 'TAN', 'ОКР', 'ROUND', 'ЦЕЛ', 'INT', 'ДЛИНАСТРОКИ', 'STRINGLENGTH',
                'СТРОКА', 'STRING', 'СОКРЛП', 'TRIMALL', 'СОКРП', 'TRIMAR', 'СОКРЛ', 'TRIMAL',
                'ЛЕВ', 'LEFT', 'ПРАВ', 'RIGHT', 'СТРНАЙТИ', 'STRFIND', 'ВРЕГ', 'UPPER', 'НРЕГ',
                'LOWER', 'СТРЗАМЕНИТЬ', 'STRREPLACE', 'НСТР', 'NSTR'

            ],
            queryOperators: /[=><+\-*\/%;,]+/,
            // The main tokenizer for our languages
            tokenizer: {
                root: [
                    [/(\.)(выполнить)(\(?)/, ['delimiter', 'identifier', 'delimiter.parenthesis']],
                    [/[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
                    // whitespace
                    { include: '@whitespace' },
                    // delimiters and operators
                    [/}/, {
                        cases: {
                            '$S2==interpolatedstring': { token: 'string.quote', next: '@pop' },
                            '$S2==litinterpstring': { token: 'string.quote', next: '@pop' },
                            '@default': '@brackets'
                        }
                    }],
                    [/^\s*#.*$/, 'preproc'],
                    [/[()\[\]]/, '@brackets'],
                    [/@symbols/, {
                        cases: {
                            '@operators': 'delimiter',
                            '@default': ''
                        }
                    }],
                    // numbers
                    [/[0-9_]*\.[0-9_]+([eE][\-+]?\d+)?[fFdD]?/, 'number.float'],
                    [/[0-9_]+/, 'number'],
                    // delimiter: after number because of .\d floats
                    [/[;,.]/, 'delimiter'],
                    // strings
                    [/(")(выбрать)/, [
                        {token: 'query.quote', next: '@query'},
                        {token: 'query.keyword'}                        
                    ]],
                    [/"([^"\\]|\\.)*$/, 'string.invalid'],
                    [/["|]/, { token: 'string.invalid', next: '@string' }],
                    [/\$\@"/, { token: 'string.quote', next: '@litinterpstring' }],
                    [/\@"/, { token: 'string.quote', next: '@litstring' }],
                    [/\$"/, { token: 'string.quote', next: '@interpolatedstring' }],
                    // characters
                    [/'[^\\']'/, 'string'],
                    [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
                    [/'/, 'string.invalid']
                ],
                query: [
                    [/[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, {
                        cases: {
                            '@queryWords': 'query.keyword',
                            '@queryWords_8_3_16': 'query.keyword',
                            '@queryExp': 'query.exp',
                            '@queryExp_8_3_20': 'query.exp',
                            '@default': 'query'
                        }
                    }],
                    [/&[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, 'query.param'],
                    [/&/, 'query.param'],
                    [/"".*""/, 'query.string'],
                    [/[()]/, 'query.brackets'],
                    [/\/\/.*$/, 'comment'],
                    [/(\|\s*)(\/\/.*$)/, [
                        {token: 'query'},
                        {token: 'query.comment'}
                    ]],
                    [/@queryOperators/, 'query.operator'],
                    [/[0-9_]*\.[0-9_]+([eE][\-+]?\d+)?[fFdD]?/, 'query.float'],
                    [/[0-9_]+/, 'query.int'],
                    [/^\s*#.*$/, 'preproc'],
                    [/\|/, 'query'],
                    [/\./, 'query'],
                    [/[?!@#$^*_]+/, 'query'],
                    [/"/, { token: 'query.quote', next: '@pop' }],
                ],
                comment: [
                    [/\/\/.*$/, 'comment'],
                ],
                string: [
                    [/^\s*\/\/.*$/, 'comment'],
                    [/[^\\"]+/, 'string'],
                    [/@escapes/, 'string.escape'],
                    [/\\./, 'string.escape.invalid'],
                    [/"/, { token: 'string.quote', next: '@pop' }],
                    [/\|.*"/, { token: 'string.quote', next: '@pop' }],
                ],
                litstring: [
                    [/[^"]+/, 'string'],
                    [/""/, 'string.escape'],
                    [/"/, { token: 'string.quote', next: '@pop' }]
                ],
                litinterpstring: [
                    [/[^"{]+/, 'string'],
                    [/""/, 'string.escape'],
                    [/{{/, 'string.escape'],
                    [/}}/, 'string.escape'],
                    [/{/, { token: 'string.quote', next: 'root.litinterpstring' }],
                    [/"/, { token: 'string.quote', next: '@pop' }]
                ],
                interpolatedstring: [
                    [/[^\\"{]+/, 'string'],
                    [/@escapes/, 'string.escape'],
                    [/\\./, 'string.escape.invalid'],
                    [/{{/, 'string.escape'],
                    [/}}/, 'string.escape'],
                    [/{/, { token: 'string.quote', next: 'root.interpolatedstring' }],
                    [/"/, { token: 'string.quote', next: '@pop' }]
                ],
                whitespace: [
                    [/\/\/.*$/, 'comment'],
                ],
            },
        },        
        themes: {
            whiteTheme: {
                base: 'vs',
                name: 'bsl-white',
                inherit: true,
                colors: themes.colors.white,
                rules: themes.rules.white
            },            
            whiteQueryTheme: {
                base: 'vs',
                name: 'bsl-white-query',
                inherit: true,
                colors: themes.colors.white,
                rules: themes.rules.white.concat(themes.rules.whiteQueryOn)
            },            
            darkTheme: {
                base: 'vs',
                name: 'bsl-dark',
                inherit: true,
                colors: themes.colors.dark,
                rules: themes.rules.dark.concat(themes.rules.darkQueryOff)
            },
            darkQueryTheme: {
                base: 'vs',
                name: 'bsl-dark-query',
                inherit: true,
                colors: themes.colors.dark,
                rules: themes.rules.dark.concat(themes.rules.darkQueryOn)
            }
        }        
    }

    let query_expressions = bsl_language.rules.queryExp.concat(bsl_language.rules.queryExp_8_3_20);
    let query_keywords = bsl_language.rules.queryWords.concat(bsl_language.rules.queryWords_8_3_16);

    let query_language = {

        id: 'bsl_query',
        rules: {
            defaultToken: '',
            tokenPostfix: 'bsl',
            ignoreCase: true,            
            keywords: query_keywords,
            expressions: query_expressions,
            operators: /[=><+\-*\/%;,]+/,
            tokenizer: {
                root: [                               
                    [/(как|as)(\s+)([a-zA-Z\u0410-\u044F]+)(\()/, [
                        {token: 'query.keyword'},
                        {token: 'query'},
                        {token: 'query.exp'},
                        {token: 'query.brackets'}
                    ]],
                    [/(как|as)(\s+)([a-zA-Z\u0410-\u044F_0-9]+)([,\s]*)/, [
                        {token: 'query.keyword'},
                        {token: 'query'},
                        {token: 'query'},
                        {token: 'query.operator'}
                    ]],
                    [/(\.)([a-zA-Z\u0410-\u044F_0-9]+)/, [
                        {token: 'query'},
                        {token: 'query'}                        
                    ]],
                    [/([a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]+)(\.)([a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]+)/, 'query'],
                    [/[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, { cases: {
                        '@keywords': 'query.keyword',
                        '@expressions': 'query.exp',
                        '@default': 'query'
                    }}],
                    [/".*?"/, 'query.string'],
                    [/&[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, 'query.param'],
                    [/&/, 'query.param'],
                    [/[()]/, 'query.brackets'],
                    [/\/\/.*$/, 'comment'],
                    [/@operators/, 'query.operator'],
                    [/[0-9_]*\.[0-9_]+([eE][\-+]?\d+)?[fFdD]?/, 'query.float'],
                    [/[0-9_]+/, 'query.int'],
                    [/\|/, 'query']                    
                ]
            },
        },        
        themes: bsl_language.themes        
    }

    let dcs_language = {
        id: 'dcs_query',
        rules: Object.assign({}, query_language.rules)
    }
    
    let dcs_expressions = query_expressions.concat(bsl_language.rules.DCSFunctions);
    dcs_language.rules.expressions = dcs_expressions; 

    languages = {
        bsl: {
            languageDef: bsl_language,
            completionProvider: {
                triggerCharacters: ['.', '"', ' '],
                provideCompletionItems: function (model, position, context, token) {
                    
                    let widget = document.querySelector('.suggest-widget');
                    widget.style.display = '';
                    widget.style.visibility = '';      

                    let bsl = new bslHelper(model, position);
                    let completition = bsl.getCompletition(context, token);
                    
                    if (generateBeforeShowSuggestEvent) {                
                        let rows = [];
                        if (Object.keys(completition).length) {
                            for (const [key, value] of Object.entries(completition.suggestions)) {
                                rows.push(value.label);
                            }                        
                        }
                        genarateEventWithSuggestData('EVENT_BEFORE_SHOW_SUGGEST', rows, context.triggerCharacter, '');
                    }

                    return completition;

                }
            },
            foldingProvider: {
                provideFoldingRanges: function (model, context, token) {
                    return bslHelper.getFoldingRanges(model);
                }
            },
            signatureProvider: {
                signatureHelpTriggerCharacters: ['(', ','],
                signatureHelpRetriggerCharacters: [')'],
                provideSignatureHelp: (model, position) => {
                    let bsl = new bslHelper(model, position);
                    return bsl.getSigHelp();
                }
            },
            hoverProvider: {
                provideHover: function (model, position) {
                    
                    if (generateBeforeHoverEvent) {
                        let bsl = new bslHelper(model, position);
                        let token = bsl.getLastToken();
                        let params = {
                            word: model.getWordAtPosition(position),
                            token: token,
                            line: position.lineNumber,
                            column: position.column
                        }
                        sendEvent('EVENT_BEFORE_HOVER', params);
                    }
                    
                    let bsl = new bslHelper(model, position);
                    return bsl.getHover();

                }
            },
            formatProvider: {
                provideDocumentFormattingEdits: function (model, options, token) {
                    return [{
                        text: bslHelper.formatCode(model),
                        range: model.getFullModelRange()
                    }];
                }
            },
            codeLenses: {
                provider: () => {},                
                resolver: () => {}
            }
        },
        query: {
            languageDef: query_language,
            completionProvider: {
                triggerCharacters: ['.', '(', '&'],
                provideCompletionItems: function (model, position) {
                    let bsl = new bslHelper(model, position);
                    return bsl.getQueryCompletition(query_language);
                }
            },
            foldingProvider: {
                provideFoldingRanges: function (model, context, token) {
                    return bslHelper.getQueryFoldingRanges(model);
                }
            },
            signatureProvider: {
                signatureHelpTriggerCharacters: ['(', ','],
                signatureHelpRetriggerCharacters: [')'],
                provideSignatureHelp: (model, position) => {
                    let bsl = new bslHelper(model, position);
                    return bsl.getQuerySigHelp();
                }
            },
            hoverProvider: {
                provideHover: () => {}
            },
            formatProvider: {
                provideDocumentFormattingEdits: () => {}
            },
            codeLenses: {
                provider: () => {},                
                resolver: () => {}
            }
        },
        dcs: {
            languageDef: dcs_language,
            completionProvider: {
                triggerCharacters: ['.', '(', '&'],
                provideCompletionItems: function (model, position) {
                    let bsl = new bslHelper(model, position);
                    return bsl.getDCSCompletition();
                }
            },
            foldingProvider: {
                provideFoldingRanges: () => {}
            },
            signatureProvider: {
                signatureHelpTriggerCharacters: ['(', ','],
                signatureHelpRetriggerCharacters: [')'],
                provideSignatureHelp: (model, position) => {
                    let bsl = new bslHelper(model, position);
                    return bsl.getDCSSigHelp();
                }
            },
            hoverProvider: {
                provideHover: () => {}
            },
            formatProvider: {
                provideDocumentFormattingEdits: () => {}
            },
            codeLenses: {
                provider: () => {},                
                resolver: () => {}
            }
        }

    };

});