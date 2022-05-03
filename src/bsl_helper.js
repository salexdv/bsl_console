
/**
 * Class for provideSignatureHelp
 */
 class SignatureHelpResult {

	constructor(helper) {
		this.value = helper;
	}

	dispose() {
	}

}

/**
 * Main helper for BSL
 */
class bslHelper {

	constructor(model, position) {

		this.model = model;
		this.position = position;
		this.lineNumber = position.lineNumber;
		this.column = position.column;

		this.wordData = model.getWordAtPosition(position);
		this.word = this.wordData ? this.wordData.word.toLowerCase() : '';

		this.lastOperator = '';
		this.hasWhitespace = false;

		this.textBeforePosition = this.getTextBeforePosition();
		this.lastExpression = this.getLastExpression();
		this.lastRawExpression = this.getLastRawExpression();
		
		this.nameField = engLang ? 'name_en': 'name';
		this.queryNameField = engLang ? 'query_name_en' : 'query_name';
		this.token = this.getLastToken();

	}

	/**
	 * Check if string has russian characters
	 * @param {string} text string for analisis
	 */
	hasRu(text) {

		return /[\u0410-\u044F]+/.test(text);

	}
	
	/**
	 * Returns the current language id
	 * 
	 * @returns {string} language identifier
	 */
	getLangId() {

		return getCurrentLanguageId();

	}

	/**
	 * Returns the token in the current position
	 * 
	 * @return {string} name of token
	 */	
	getLastToken() {

		let token = '';

		let value = this.model.getValueInRange(new monaco.Range(1, 1, this.lineNumber, this.column));
		let lang_id = this.getLangId();
		let tokens = monaco.editor.tokenize(value, lang_id);

		if (tokens.length) {
			
			let last_tokens = tokens[tokens.length - 1];

			if (last_tokens.length)
				token = last_tokens[last_tokens.length - 1].type;

		}

		return token;

	}

	/**
	 * Returns the last word in block of text
	 * @param {string} token_name 
	 * @param {int} startLineNumber the first line of block
	 * @param {int} startColumn  the first column of block
	 * @param {int} endLineNumber the last line of block
	 * @param {int} endColumn the last column of block
	 * @param {array} ignore_words ingored words
	 * 
	 * @returns  {string} word whith token
	 */

	getLastWordWithTokenInRange(token_name, startLineNumber, startColumn, endLineNumber, endColumn, ignored_words) {

		let word = '';

		let value = this.model.getValueInRange(new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn));

		if (value) {

			let model = monaco.editor.createModel(value);
			let lang_id = this.getLangId();
			let tokens = monaco.editor.tokenize(value, lang_id);

			if (tokens.length) {

				let idx_line = tokens.length - 1;

				while (0 <= idx_line && !word) {

					let items = tokens[idx_line];

					if (items.length) {

						let idx_item = items.length - 1;

						while (0 <= idx_item && !word) {

							let token = items[idx_item];
							let token_type = token.type;

							if (0 <= token_type.indexOf(token_name)) {

								let text = model.getWordAtPosition(new monaco.Position(idx_line + 1, token.offset + 1));

								if (text && ignored_words.indexOf(text.word.toLowerCase()) == -1) {
									word = text.word;
								}


							}

							idx_item--;

						}

					}

					idx_line--;

				}

			}

		}

		return word;

	}

	/**
	 * Returns the last non whitespace char of line
	 * @param {int} lineNumber line number
	 * 
	 * @returns {string} last char of line
	 */
	getLastCharInLine(lineNumber) {

		let char = '';

		if (lineNumber) {

			let column = this.model.getLineLastNonWhitespaceColumn(lineNumber);

			if (0 < column)
				char = this.model.getValueInRange(new monaco.Range(lineNumber, column - 1, lineNumber, column));

		}

		return char;

	}

	/**
	 * Determines if the text in current position
	 * is a literal string or not
	 * 
	 * @returns {bool}
	 */
	isItStringLiteral() {
		
		return !!~this.token.search(/(string|query)/);

	}

	/**
	 * Determines if the last expression has separated params
	 * 
	 * @returns {bool}
	 */
	 lastExpressionHasSeparatedParams() {
		
		let expArray = this.getExpressioArray();
		return (expArray.length && 0 <= expArray.pop().indexOf(','))

	}

	/**
	 * Find first string which has no pair braces
	 * @param {string} str string for analisis
	 * 
	 * @return {object} unclosed string
	 */
	unclosedString(str) {

		let index = str.length - 1;
		let flag = 0;
		let character = '';
		let unclosed = '';

		while (0 <= index) {
			character = str[index];
			unclosed = character + unclosed;
			if (character == ')')
				flag++;
			if (character == '(') {
				if (flag == 0)
					return { string: unclosed, index: index };
				else
					flag--;
			}
			index--;
		}

		return { string: '', index: -1 };

	}

	/**
	 * Gets whole text beetween first and current position
	 * 
	 * @returns {string} text
	 */
	getFullTextBeforePosition() {

		return this.model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: this.lineNumber, endColumn: this.column }).trim().toLowerCase();

	}

	/**
	 * Gets current line`s text until cursor position
	 * 
	 * @returns {string} text
	 */
	getTextBeforePosition() {

		let text = this.model.getValueInRange({ startLineNumber: this.lineNumber, startColumn: 1, endLineNumber: this.lineNumber, endColumn: this.column });
		this.hasWhitespace = (text.substr(-1) == ' ');
		return text.trim().toLowerCase();

	}

	/**
	 * Returns array which contain operators and expressions from textBeforePosition
	 * Example, "ТаблицаЗначений.Найти(Справочники.Номенклатура.НайтиПоКоду("
	 * 	[0] => ТаблицаЗначений
	 * 	[1] => .
	 * 	[2] => Найти	 
	 * 	[3] => (
	 * 	[4] => Справочники
	 * 	[5] => .
	 * 	[6] => Номенклатура
	 * 	[7] => .
	 * 	[8] => НайтиПоКоду
	 * 	[9] => (
	 * * @returns {array} array with expressions
	 */
	getRawExpressioArray() {

		return this.textBeforePosition.replace(/([\(\[\+\-\=\<\>\%\/\.\,;:"])/g, ' $1 ').split(' ');

	}

	/**
	 * Returns last expression (not operator and braces) from textBeforePosition
	 * Example, "ТаблицаЗначений.Найти(Справочники.Номенклатура.НайтиПоКоду("
	 * 	-> НайтиПоКоду
	 * @returns {string} last expression 
	 */
	getLastRawExpression() {

		let exp = '';
		let expArray = this.getRawExpressioArray();
		this.lastOperator = '';
		let index = expArray.length - 1;

		while (!exp && 0 <= index) {
			if (/^[^\(\)\[\]=\+\*/%<>"\.\,;:][a-zA-Z0-9\u0410-\u044F_\.]*$/.test(expArray[index]))
				exp = expArray[index]
			else {
				if (expArray[index].trim() !== '' && !this.lastOperator)
					this.lastOperator = expArray[index].replace(/[a-zA-Z0-9\u0410-\u044F_\.]/, '');
			}
			index--;
		}

		return exp;

	}

	/**
	 * Returns last expression from textBeforePosition
	 * but except text in last unclosed braces
	 * Example, "ТаблицаЗначений.Найти(Справочники.Номенклатура.НайтиПоКоду("
	 * 	[0] => ТаблицаЗначений.Найти	 
	 * 	[1] => (
	 * 	[2] => Справочники.Номенклатура.НайтиПоКоду
	 * 	[3] => (
	 * * @returns {array} array with expressions
	 */
	getExpressioArray() {

		let text = this.textBeforePosition;
		let unclosed = this.unclosedString(text);
		if (0 <= unclosed.index) {
			text = text.substr(0, unclosed.index);
			unclosed = unclosed.string;
		}
		else {
			unclosed = '';
		}
		let array1 = text.replace(/([\(\[\+\-\=\<\>\%\/])/g, ' $1 ').split(' ');
		return unclosed ? array1.concat(unclosed) : array1;

	}

	/**
	 * Returns last expression from textBeforePosition
	 * Example, "ТаблицаЗначений.Найти(Справочники.Номенклатура.НайтиПоКоду("
	 * 	-> Справочники.Номенклатура.НайтиПоКоду
	 * @returns {string} last expression 
	 */
	getLastExpression() {

		let exp = '';
		let expArray = this.getExpressioArray();
		let index = expArray.length - 1;

		while (!exp && 0 <= index) {
			if (/^(?!новый |new )[^\(\)\[\]=\+\*/%<>"][a-zA-Z0-9\u0410-\u044F_\.]*$/.test(expArray[index])) {
				exp = expArray[index]
			}
			index--;
		}

		return exp;

	}

	/**
	 * Returns last expression from getExpressioArray - nstep
	 * @param {int} nstep - quantity of steps
	 */
	getLastNExpression(nstep) {

		let expArray = this.getRawExpressioArray();
		return (nstep < expArray.length) ? expArray[expArray.length - 1 - nstep] : '';

	}

	/**
	 * Returns last word before position
	 * @returns {string} last word 
	 */
	getLastSeparatedWord(position) {
		
		let word = '';

		if (position == undefined)
			position = this.position;

		let match = Finder.findPreviousMatch(this.model, '[\\s\\n]', position);
		
		if (match) {
			
			let match_pos = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (match_pos.lineNumber < position.lineNumber || match_pos.lineNumber == position.lineNumber && match_pos.column < position.column) {

				position = match_pos;
				match = Finder.findPreviousMatch(this.model, '[a-zA-Z0-9\u0410-\u044F]+', position);

				if (match) {
					
					let range = new monaco.Range(match.range.startLineNumber, match.range.startColumn - 1, match.range.startLineNumber, match.range.startColumn);
					
					if (range.startLineNumber < position.lineNumber || range.startLineNumber == position.lineNumber && range.startColumn < position.column) {

						let prevChar = this.getLastCharacter(range);

						if (prevChar == '.') {
							position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);
							return this.getLastSeparatedWord(position);
						}
						else
							word = match.matches[0];

					}

				}

			}

		}

		return word;

	}

	/**
	 * Returns lasts N word before position
	 * 
	 * @returns {array} array with words
	 */
	getLastSeparatedWords(nstep) {
		
		let words = [];

		let pattern = '[a-zA-Z0-9\u0410-\u044F]+';
		let position = this.position;
		let match = Finder.findPreviousMatch(this.model, pattern, position);
		let step = 0;

		while (match && step < nstep) {			
			words.push(match.matches[0]);
			position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);
			match = Finder.findPreviousMatch(this.model, pattern, position);
			step++;
		}

		return words;

	}

	/**
	 * Returns last character
	 * 
	 * @returns {array} array with words
	 */
	getLastCharacter(range) {
		
		if (range == undefined)
			range = new monaco.Range(this.lineNumber, this.column - 1, this.lineNumber, this.column);
		
		let content = this.model.getValueInRange(range);		

		return content ? content : '';

	}

	/**
	 * Returns the first word until open bracket
	 * at current position
	 * 
	 * @returns {string} word
	 */
	getWordUntilOpenBracket() {

		let word = '';

		let match = Finder.findPreviousMatch(this.model, '\\(', this.position);
		
		if (match) {

			const position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = this.lineNumber) {
					
				let wordUntil = this.model.getWordUntilPosition(position);

				if (wordUntil)
					word = wordUntil.word.toLowerCase();

			}

		}

		return word

	}

	/**
	 * GUID genarator
	 * 
	 * @returns {string} GUID
	 */
	guid() {

		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
			(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
		);

	}

	/**
	 * Convert code to markdown
	 * with syntax highlighting
	 * 
	 * @param {string} code snippet
	 * 
	 * @returns {string} markdown string
	 */
	prepareCodeDocumentation(snippet) {

		return "```bsl\n" + snippet + "\n```";

	}

	/**
	 * Convert snippet documentation to markdown
	 * with syntax highlighting
	 * 
	 * @param {string} snippet code of snippet 
	 * 
	 * @returns {string} markdown string
	 */
	prepareSnippetDocumentation(snippet) {

		// Replace placeholders like ${1:Value}, ${Value}, $0
		let doc = snippet.replace(/\${\d{0,}:?(.*?)}/gmi, '$1');
		doc = doc.replace(/\$\d{1,}/gmi, '');

		return this.prepareCodeDocumentation(doc);

	}

	/**
	 * Get array of metadata object names
	 * 
	 * @param {string} metadataItem name of metadata object
	 * @param {completionItem} completionItem current item of suggestion list
	 * 
	 * @returns {array} array of metadata object names
	 */
	getSnippetMetadataItems(metadataItem, completionItem) {

		let items = [];

		if (bslMetadata.hasOwnProperty(metadataItem)) {

			if (Object.keys(bslMetadata[metadataItem].items).length) {

				for (const [key, value] of Object.entries(bslMetadata[metadataItem].items)) {
					items.push(key);
				}

			}
			else {

				if (completionItem)
					setTimeout(() => {
						requestMetadata(bslMetadata[metadataItem].name.toLowerCase(), 'snippet', {
							snippet_guid: completionItem.guid
						});
					}, 10);

			}

		}

		return items;

	}

	/**
	 * Get array of metadata object by metadata name
	 * 
	 * @param {string} metadataName name of metadata object
	 * @param {completionItem} completionItem current item of suggestion list
	 * 
	 * @returns {array} array of metadata object names
	 */
	getSnippetMetadataItemsByName(metadataName, completionItem) {

		let items = [];

		let relations = [];
		relations['Справочник'] = 'catalogs';
		relations['ВыберитеСправочник'] = 'catalogs';
		relations['Документ'] = 'documents';
		relations['ВыберитеДокумент'] = 'documents';
		relations['РегистрСведений'] = 'infoRegs';
		relations['ВыберитеРегистрСведений'] = 'infoRegs';
		relations['РегистрНакопления'] = 'accumRegs';
		relations['ВыберитеРегистрНакопления'] = 'accumRegs';
		relations['РегистрБухгалтерии'] = 'accountRegs';
		relations['ВыберитеРегистрБухгалтерии'] = 'accountRegs';
		relations['РегистрРасчета'] = 'calcRegs';
		relations['ВыберитеРегистрРасчета'] = 'calcRegs';
		relations['Обработка'] = 'dataProc';
		relations['ВыберитеОбработку'] = 'dataProc';
		relations['Отчет'] = 'reports';
		relations['ВыберитеОтчет'] = 'reports';
		relations['Перечисление'] = 'enums';
		relations['ВыберитеПеречисление'] = 'enums';
		relations['ПланСчетов'] = 'сhartsOfAccounts';
		relations['ВыберитеПланСчетов'] = 'сhartsOfAccounts';
		relations['БизнесПроцесс'] = 'businessProcesses';
		relations['ВыберитеБизнесПроцесс'] = 'businessProcesses';
		relations['Задача'] = 'tasks';
		relations['ВыберитеЗадачу'] = 'tasks';
		relations['ПланОбмена'] = 'exchangePlans';
		relations['ВыберитеПланОбмена'] = 'exchangePlans';
		relations['ПланВидовХарактеристик'] = 'chartsOfCharacteristicTypes';
		relations['ВыберитеПланВидовХарактеристик'] = 'chartsOfCharacteristicTypes';
		relations['ПланВидовРасчета'] = 'chartsOfCalculationTypes';
		relations['ВыберитеПланВидовРасчета'] = 'chartsOfCalculationTypes';
		relations['Константа'] = 'constants';
		relations['ВыберитеКонстанту'] = 'constants';
		relations['РегистрРасчета'] = 'calcRegs';

		let relation = relations[metadataName];

		if (relation)
			items = this.getSnippetMetadataItems(relation, completionItem);

		return items;

	}

	/**
	 * Get array of metadata object names by snippet action
	 * 
	 * @param {string} action type of action from snippet 
	 * @param {completionItem} completionItem current item of suggestion list
	 * 
	 * @returns {array} array of metadata object names
	 */
	getSnippetMetadataItemsByAction(action, completionItem) {

		let items = [];

		if (0 <= action.indexOf('ОбъектМетаданных:')) {
			action = action.replace('ОбъектМетаданных:', '');
			let metadata_array = action.split(',');
			metadata_array.forEach((name) => {
				let metadata_items = this.getSnippetMetadataItemsByName(name, completionItem);
				items = items.concat(metadata_items);
			});
		}
		else
			items = this.getSnippetMetadataItemsByName(action, completionItem);

		return items;

	}

	/**
	 * Replace standart choice elements with metadata objects
	 * or other additional transformations
	 * 
	 * @param {string} snippet code of snippet
	 * @param {string} completionItem item of suggestion list
	 * 
	 * @returns {string} formated code of snippet
	 */
	prepareSnippetCode(snippet, completionItem) {

		let regexp = RegExp('\\${(\\d{1,}):(.*?)}', 'gmi');
		let match = null;

		while ((match = regexp.exec(snippet)) !== null) {

			let action = match[2];
			let items = this.getSnippetMetadataItemsByAction(action, completionItem);

			if (items.length) {

				let text = match[0];
				text = text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
				let replace_reg = RegExp(text, 'gmi');
				let prev_snippet = snippet;

				if (1 < items.length)
					snippet = snippet.replace(replace_reg, '${' + match[1] + '|' + items.join() + '|' + '}');
				else
					snippet = snippet.replace(replace_reg, items[0]);

				if (snippet == prev_snippet)
					break;
			}

		}

		return snippet;

	}

	/**
	 * Determines if string contain class constructor (New|Новый)	 	 
	 * 
	 * @returns {bool}
	 */
	requireClass() {

		let exp = this.getLastNExpression(1);
		return /^(?:new|новый)$/.test(exp);

	}

	/**
	 * Retuns function name from last expression
	 * 
	 * @returns {string} - name of function or empty string
	 */
	getFuncName() {

		let regex = /(.+?)(?:\((.*))?$/.exec(this.lastExpression);
		return regex && 1 < regex.length ? regex[1] : '';

	}

	/**
	 * Determines if string contain type constructor (Type|Тип)
	 * 
	 * 
	 * @returns {bool}
	 */
	requireType() {

		let exp = this.getFuncName();
				
		if (exp == 'typedescription' || exp == 'описаниетипов') {			
			return !this.lastExpressionHasSeparatedParams();
		}
		else
			return (exp == 'type' || exp == 'тип');

	}

	/**
	 * Determines if string contain query value constructor (ЗНАЧЕНИЕ|VALUE)
	 * 
	 * 
	 * @returns {bool}
	 */
	requireQueryValue() {

		let exp = this.getFuncName();
		return (exp == 'value' || exp == 'значение');

	}

	/**
	 * Checks if string contain ref constructor (ССЫЛКА|REFS)
	 * 
	 * 
	 * @returns {bool}
	 */
	requireQueryRef() {

		let match = editor.getModel().findPreviousMatch('\\s+(ссылка|refs)\\s+' , editor.getPosition(), true);		
		return (match && match.range.startLineNumber == this.lineNumber);

	}	

	/**
	 * Removes from array of suggestions duplicated items
	 * 
	 * @returns {array} suggestions
	 */
	deleteSuggesstionsDuplicate(suggestions) {
		
		let i = 0;
		while (i < suggestions.length) {					
			if (suggestions.some(suggest => (suggest.label === suggestions[i].label && suggest != suggestions[i])))
				suggestions.splice(i, 1)
			else
				i++;
		}		

	}

	/**
	 * Removes brackets from signature's label
	 * (НомерДокумента, ДатаИнтервала) : ДокументСсылка.<Имя справочника>; Неопределено => НомерДокумента, ДатаИнтервала
	 * 
	 * @returns {string} new label
	 */
	getClearSignatureLabel(label) {

		return label.replace(/(\()(.*)(\).*)/, '$2');

	}

	/**
	 * Determines is the current word has certain char before or not
	 * 
	 * @returns {bool}
	 */
	wordHasCharsBefore(chars) {

		let charExists = false;
		let data = this.wordData;

		if (this.wordData) {
			let range = new monaco.Range(this.lineNumber, data.startColumn - chars.length, this.lineNumber, data.startColumn);
			let previous_char = this.model.getValueInRange(range);
			charExists = (previous_char.toLowerCase() == chars.toLowerCase());
		}

		return charExists;

	}

	/**
	 * Determines is the current word has certain char after or not
	 * 
	 * @returns {bool}
	 */
	wordHasCharsAfter(chars) {

		let charExists = false;
		let data = this.wordData;

		if (this.wordData) {
			let range = new monaco.Range(this.lineNumber, data.endColumn, this.lineNumber, data.endColumn + chars.length);
			let next_char = this.model.getValueInRange(range);
			charExists = (next_char.toLowerCase() == chars.toLowerCase());
		}

		return charExists;

	}

	/**
	 * Determines is it function in the current position on not
	 * 
	 * @returns {bool}
	 */
	isItFunction() {

		return this.wordHasCharsAfter('(');

	}

	/**
	 * Fills array of completion for language keywords, classes, global functions,
	 * global variables and system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getCommonCompletion(suggestions, data, kind, allowAtStart) {

		let word = this.word;
		let emptyString = (this.textBeforePosition.slice(0, -1).trim() === '');		

		if (word && (allowAtStart || !emptyString)) {

			let values = [];				
			for (const [key, value] of Object.entries(data)) {
								
				if (value.hasOwnProperty(this.nameField)) {

					let command = null;
					let postfix = '';
					let post_action = null;
					let signatures = [];

					if (kind == monaco.languages.CompletionItemKind.Constructor) {
						signatures = this.getConstructSignature(value);
						if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
							postfix = '()';
					}
					else if (kind == monaco.languages.CompletionItemKind.Function) {
						signatures = this.getMethodsSignature(value);
						if (signatures.length) {
							postfix = '(';
							post_action = 'editor.action.triggerParameterHints';
						}
						if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
							postfix = '()';
					}
			
					let ref = null;
					if (value.hasOwnProperty('ref'))
						ref = value.ref;

					if (ref || signatures.length) {
						// If the attribute contains a ref, we need to run the command to save the position of ref
						command = {
							id: 'vs.editor.ICodeEditor:1:saveref',
							arguments: [
								{
									"name": value[this.nameField],
									"data": {
										"ref": ref,
										"sig": signatures
									},
									"post_action": post_action
								}
							]
						}
					}

					let template = value.hasOwnProperty('template') ? value.template : '';

					values.push({ name: value[this.nameField], detail: value.description, description: value.hasOwnProperty('returns') ? value.returns : '', postfix: postfix, template: template, command: command });

				}
				else {

					if ( (key != 'ru' && key != 'en') || (key == 'ru' && !engLang) || (key == 'en' && engLang)) {

						for (const [inkey, invalue] of Object.entries(value)) {
							let postfix = '';
							if (invalue.hasOwnProperty('postfix'))
								postfix = invalue.postfix;
							values.push({ name: inkey, detail: '', description: '', postfix: postfix, template: '', command: null });
						}

					}

				}

			}

			values.forEach(function (value) {
				if (value.name.toLowerCase().startsWith(word)) {
					suggestions.push({
						label: value.name,
						kind: kind,
						insertText: value.template ? value.template : value.name + value.postfix,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						detail: value.detail,
						documentation: value.description,
						command: value.command
					});
				}
			});
		}

	}

	/**
	 * Checks if the object contains properties
	 * 
	 * @param {object} obj the object for checking
	 * @param {sting} property1 name of property1
	 * @param {sting} property2 name of property2
	 * @param {sting} propertyN name of propertyN
	 * 
	 * @returns {boolean} true - the object contains every poperty, fasle - otherwise
	 */
	objectHasProperties(obj) {

		var args = Array.prototype.slice.call(arguments, 1);

		for (let i = 0; i < args.length; i++) {

			if (!obj || !obj.hasOwnProperty(args[i])) {
				return false;
			}

			obj = obj[args[i]];
		}

		return true;
	}

	/**
	 * Checks if the object contains properties from array
	 * 
	 * @param {object} obj the object for checking
	 * @param {array} props array of properties	 
	 * 
	 * @returns {boolean} true - the object contains every poperty, fasle - otherwise
	 */
	static objectHasPropertiesFromArray(obj, props) {

		for (let i = 0; i < props.length; i++) {

			if (!obj || !obj.hasOwnProperty(props[i])) {
				return false;
			}

			obj = obj[props[i]];
		}

		return true;
	}

	/**
	 * Sets property of object
	 * 
	 * @param {Object} obj the object to setting property
	 * @param {string} path the path to property
	 * @param {Object} value the value of property
	 */
	static setObjectProperty(obj, path, value) {
		
		if (Object(obj) !== obj) return obj;
	    
		if (!Array.isArray(path))
			path = path.toString().match(/[^.[\]]+/g) || []; 

	    path.slice(0,-1).reduce((a, c, i) => 
	         Object(a[c]) === a[c]	             
	             ? a[c] 	             
	             : a[c] = Math.abs(path[i+1])>>0 === +path[i+1] 
	                   ? []
	                   : {},
			 obj)[path[path.length-1]] = value;
			 
	    return obj;
	};

	/**
	 * Fill suggestion list for metadata description
	 *
	 * @param {array} suggestions the list of suggestions
	 *
	 * @returns {boolean} true - is metadata description, fasle - otherwise
	 */
	getMetadataDescription(suggestions) {

		if (this.lastRawExpression == 'метаданные' || this.lastRawExpression == 'metadata') {

			let exp_arr = this.getRawExpressioArray();

			if (exp_arr.length <= 3 || exp_arr[exp_arr.length - 4] != '.') {
				
				for (const [key, value] of Object.entries(bslMetadata)) {

					if (this.objectHasProperties(value, 'metadata')) {

						let command = {
							id: 'vs.editor.ICodeEditor:1:saveref',
							arguments: [
								{
									"name": value[this.nameField],
									"data": {
										"ref": key + '.metadata',
										"sig": null
									}									
								}
							]
						}
						
						suggestions.push({
							label: value[this.nameField],
							kind: monaco.languages.CompletionItemKind.Function,
							insertText: value[this.nameField],
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,							
							command: command
						});

					}
		
				}

				return true;

			}

		}

		return false;

	}

	/**
	 * Gets the list of methods owned by object
	 * and fills the suggestions by it
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 * @param {sting} methodsName the name of node (objMethods, refMethods)
	 */
	getMetadataMethods(suggestions, obj, methodsName, metadataKey, medatadaName) {

		if (obj.hasOwnProperty(methodsName)) {
			
			let signatures = [];

			for (const [mkey, mvalue] of Object.entries(obj[methodsName])) {

				let command = null;
				let postfix = '';
				let post_action = null;

				signatures = this.getMethodsSignature(mvalue);

				if (signatures.length) {
					postfix = '(';
					post_action = 'editor.action.triggerParameterHints';
				}

				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';

				let ref = null;
				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref;

				if (ref && ref.indexOf(':') != -1) {
					if (metadataKey && medatadaName) {
						if (ref.indexOf(':metadata') != -1)
							ref = metadataKey + '.metadata';
						else if (ref.indexOf(':obj') != -1)
							ref = metadataKey + '.' + medatadaName + '.obj';
						else
							ref = metadataKey + '.' + medatadaName + '.ref';
					}
				}

				if (ref || signatures.length) {
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = {
						id: 'vs.editor.ICodeEditor:1:saveref',
						arguments: [
							{
								"name": mvalue[this.nameField],
								"data": {
									"ref": ref,
									"sig": signatures
								},
								"post_action": post_action
							}
						]
					}
				}
				
				suggestions.push({
					label: mvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Function,
					insertText: mvalue.name + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: mvalue.description,
					command: command
				});

			}

			if (methodsName == 'objMethods' && this.objectHasProperties(obj, 'items', medatadaName, 'registerRecords')) {
				
				let recName = obj.items[medatadaName].registerRecords[this.nameField];
				let list = [];

				obj.items[medatadaName].registerRecords.registers.forEach(function (regName) {
					list.push({
						name: regName.split('.')[1],
						ref: regName,
						kind: monaco.languages.CompletionItemKind.Function,
					});
				});

				let command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": recName, "data": { "list": list } }] }

				suggestions.push({
					label: recName,
					kind: monaco.languages.CompletionItemKind.Function,
					insertText: recName,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					command: command
				});

			}
			
		}
			

	}

	/**
	 * Gets the list of commmon properties owned by object
	 * and fills the suggestions by it
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 */
	getMetadataCommmonObjectProperties(suggestions, obj) {

		if (obj.hasOwnProperty('objProperties')) {
			
			let signatures = [];

			for (const [mkey, mvalue] of Object.entries(obj.objProperties)) {

				let command = null;
							
				if (mvalue.hasOwnProperty('ref'))
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": mvalue[this.nameField], "data": { "ref": mvalue.ref, "sig": null } }] };
				
				suggestions.push({
					label: mvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: mvalue.name,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: mvalue.description,
					command: command
				});

			}
			
		}			

	}

	/**
	 * Fills suggestions from saved list
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {string} wordRef reference string like classes.HTTPОтвет
	 */
	getListSuggestions(suggestions, wordContext) {

		if (wordContext && wordContext.list) {
			
			wordContext.list.forEach(function(listItem) {

				let command = null;

				if (listItem.hasOwnProperty('command'))
					command = listItem.command;
				else if (listItem.hasOwnProperty('ref'))
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": listItem.name, "data": { "ref": listItem.ref, "sig": null } }] }				
				

				let name = listItem.hasOwnProperty('name') ? listItem.name : listItem.label;

				suggestions.push({
					label: name,
					kind: listItem.kind,
					insertText: name,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					command: command
				});

			});
							
		}

	}

	/**
	 * Fills suggestions from systemEnum
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 */
	getSystemEnumSuggestions(suggestions, obj) {

		if (obj.hasOwnProperty('values')) {

			for (const [pkey, pvalue] of Object.entries(obj.values)) {

				let command = null;

				if (pvalue.hasOwnProperty('ref'))
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": pvalue[this.nameField], "data": { "ref": pvalue.ref, "sig": null } }] };

				suggestions.push({
					label: pvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: pvalue[this.nameField],
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: pvalue.description,
					documentation: '',
					command: command
				});

			}

		}

	}

	/**
	 * Fills the suggestions for reference-type object
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {string} wordRef reference string like classes.HTTPОтвет
	 */
	getRefSuggestions(suggestions, wordContext) {

		if (wordContext && wordContext.ref) {
			
			let arrRefs = wordContext.ref.split(',');
			let parentRef = wordContext.parent_ref;
			let required_metadata = [];
						
			for (let i = 0; i < arrRefs.length; i++) {
			
				let refArray = arrRefs[i].trim().split('.');

				if (refArray.length >= 2) {

					let itemName = refArray[0];
					let subItemName = refArray[1];
					let isObject = (refArray.length == 3 && refArray[2] == 'obj');

					if (itemName == 'classes' || itemName == 'types') {
						if (this.objectHasProperties(bslGlobals, itemName, subItemName)) {
							this.getClassSuggestions(suggestions, bslGlobals[itemName][subItemName]);
						}
					}
					else if (itemName == 'systemEnum') {
						if (this.objectHasProperties(bslGlobals, itemName, subItemName)) {
							this.getSystemEnumSuggestions(suggestions, bslGlobals[itemName][subItemName]);
						}
					}
					else if (subItemName == 'metadata' && this.objectHasProperties(bslMetadata, itemName, 'metadata')) {
						this.getClassSuggestions(suggestions, bslMetadata[itemName]['metadata']);
					}
					else if (itemName == 'universalObjects' && this.objectHasProperties(bslGlobals, itemName, subItemName)) {
						this.getUniversalObjectSuggestions(suggestions, bslGlobals[itemName][subItemName], parentRef);
					}
					else {

						if (isQueryMode() || isDCSMode()) {

							if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, 'properties')) {
								
								this.fillSuggestionsForMetadataItem(suggestions, bslMetadata[itemName].items[subItemName], itemName, subItemName);
								let module_type = isObject ? 'object' : 'manager';
								
								if (!this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, module_type))
									required_metadata.push('module.' + module_type + '.' + window.bslMetadata[itemName].name + '.' + subItemName);

							}							
							else if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName))
								required_metadata.push(window.bslMetadata[itemName].name + '.' + subItemName);
							else if (this.objectHasProperties(bslMetadata, itemName, 'items'))
								required_metadata.push(window.bslMetadata[itemName].name);

						}
						else {

							let tabIndex = refArray.indexOf('tabulars');
							let tabName = (0 < tabIndex) ? refArray[3] : '';
							let isObject = (0 < refArray.indexOf('obj'));
							let methodsName = isObject ? 'objMethods' : 'refMethods'

							if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, 'properties')) {
								
								let module_type = isObject ? 'object' : 'manager';
								
								if (tabName) {

									if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, 'tabulars', tabName)) {
										let tabObject = bslMetadata[itemName].items[subItemName].tabulars[tabName];
										this.fillSuggestionsForMetadataItem(suggestions, tabObject, itemName, subItemName);
									}
									else {
										required_metadata.push(window.bslMetadata[itemName].name + '.' + subItemName + '.tabulars.' + tabName);
									}

								}
								else {

									if (!this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, module_type))
										required_metadata.push('module.' + module_type + '.' + window.bslMetadata[itemName].name + '.' + subItemName);

									this.fillSuggestionsForMetadataItem(suggestions, bslMetadata[itemName].items[subItemName], itemName, subItemName);
									this.getMetadataMethods(suggestions, bslMetadata[itemName], methodsName, itemName, subItemName);

									if (isObject) {
										this.getMetadataCommmonObjectProperties(suggestions, bslMetadata[itemName]);
										this.getMetadataGeneralMethodCompletionByType(bslMetadata[itemName].items[subItemName], 'object', suggestions, 'Method');
									}

								}
								
							}
							else if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName))
								required_metadata.push(window.bslMetadata[itemName].name + '.' + subItemName);
							else if (this.objectHasProperties(bslMetadata, itemName, 'items'))
								required_metadata.push(window.bslMetadata[itemName].name);

						}

					}

				}

			}

			if (required_metadata.length) {
				required_metadata = required_metadata.filter((v, i, s) => s.indexOf(v) === i);
				requestMetadata(required_metadata.toString());
			}

			if (1 < arrRefs.length)
				this.deleteSuggesstionsDuplicate(suggestions);
			
		}

		this.getListSuggestions(suggestions, wordContext);

	}

	/**
	 * Fills the suggestions for reference-type object
	 * if a reference was found in the previous position
	 * 
	 * @param {array} suggestions the list of suggestions
	 */
	 getRefCompletionFromPosition(suggestions, currentPosition, allowLookBehind) {
		
		let wordContext = null;
		let match = Finder.findPreviousMatch(this.model, '(?:\\.|\\[\\d+\\])', currentPosition);
		
		if (match) {

			let position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = currentPosition.lineNumber) {

				let lineContextData = contextData.get(position.lineNumber)

				if (lineContextData) {

					let word = this.model.getWordUntilPosition(position).word;

					if (word) {
						wordContext = lineContextData.get(word.toLowerCase());
						this.getRefSuggestions(suggestions, wordContext);
					}
					else if (this.lastOperator == ')') {
						wordContext = lineContextData.get(this.lastRawExpression);
						this.getRefSuggestions(suggestions, wordContext);
					}
					else {
						let var_match = Finder.findPreviousMatch(this.model, this.lastRawExpression + '\\[\\d+\\]', position, false);
						if (var_match && var_match.range.startLineNumber == position.lineNumber) {
							let get_name = engLang ? 'get' : 'получить';
							wordContext = lineContextData.get(get_name);
							this.getRefSuggestions(suggestions, wordContext);
						}
					}

				}

				if (!suggestions.length && allowLookBehind) {
					
					// So we have to use 2 rexep to detect last function`s (field`s) reference
					match = Finder.findPreviousMatch(this.model, this.lastRawExpression + '\\s*=\\s*.*', currentPosition);
			
					if (match) {

						position = new monaco.Position(match.range.endLineNumber, match.range.endColumn);

						match = Finder.findPreviousMatch(this.model, '\\.([^.]*?)\\s?(?:;|\\()', position);

						if (!match)
							match = Finder.findPreviousMatch(this.model, '([a-zA-Z0-9\u0410-\u044F_]+)\\(', position);

						if (match) {

							lineContextData = contextData.get(match.range.startLineNumber);

							if (lineContextData) {

								let expression = match.matches[match.matches.length - 1].toLowerCase();
								let index_read = /(.+?)(\[\d+\])/.exec(expression);

								if (index_read)
									expression = engLang ? 'get' : 'получить';

								wordContext = lineContextData.get(expression);
								this.getRefSuggestions(suggestions, wordContext);

							}
								
						}

					}
				}
			}

		}

		return wordContext;

	}

	/**
	 * Fills the suggestions for reference-type object
	 * if a reference was found in the previous position
	 * 
	 * @param {array} suggestions the list of suggestions
	 */
	getRefCompletion(suggestions) {
		
		this.getRefCompletionFromPosition(suggestions, this.position, true);
		
	}

	/**
	 * Fills array of completion for language keywords, classes, global functions,
	 * global variables and system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getCustomObjectsCompletion(suggestions, data, kind) {

		let objName = this.getLastNExpression(2);
		let word = this.lastRawExpression;

		if (this.getLastCharacter() == '.' && objName) {

			for (const [key, value] of Object.entries(data)) {
				
				for (const [ikey, ivalue] of Object.entries(value)) {
					
					if (ikey.toLowerCase() == objName) {
						
						this.fillSuggestionsForMetadataItem(suggestions, ivalue, key, ikey);
						this.getMetadataMethods(suggestions, ivalue, 'methods', null, null);

						if (ivalue.hasOwnProperty('ref'))
							this.getRefSuggestions(suggestions, ivalue)

					}
					
				}

			}

		}
		else if (word) {

			for (const [key, value] of Object.entries(data)) {
				
				for (const [ikey, ivalue] of Object.entries(value)) {
					
					if (ikey.toLowerCase().startsWith(word)) {
						
						let insertText = ikey;

						if (word == '&')
							insertText = insertText.replace('&', '');
						
						suggestions.push({
							label: ikey,
							kind: kind,
							insertText: insertText,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
							detail: ivalue.detail,
							documentation: ivalue.description
						});
					}
					
				}

			}

		}		

	}

	/**
	 * Fills the suggestions for universal objects
	 * like Tabulas Sections
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj universal object
	 * @param {string}  parentRef ref to parent like catalogs.Товары.tabulars.ДополнительныеРеквизиты
	 */
	 getUniversalObjectSuggestions(suggestions, obj, parentRef) {

		if (obj.hasOwnProperty('methods')) {

			for (const [mkey, mvalue] of Object.entries(obj.methods)) {

				let description = mvalue.hasOwnProperty('returns') ? mvalue.returns : '';
				let signatures = this.getMethodsSignature(mvalue);
				let command = null;
				let postfix = '';				
				let post_action = null;

				if (signatures.length) {
					postfix = '(';
					post_action = 'editor.action.triggerParameterHints';
				}

				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';
				
				let ref = null;
				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref.replace('parent', parentRef);

				if (ref || signatures.length) {					
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = {
						id: 'vs.editor.ICodeEditor:1:saveref',
						arguments: [
							{
								"name": mvalue[this.nameField],
								"data": {
									"ref": ref,
									"sig": signatures
								},
								"post_action": post_action
							}
						]
					};
				}

				suggestions.push({
					label:  mvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Method,
					insertText: mvalue[this.nameField] + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: mvalue.description,
					documentation: description,
					command: command
				});
	
			}

		}

		if (obj.hasOwnProperty('properties')) {

			for (const [pkey, pvalue] of Object.entries(obj.properties)) {
				
				let command = null;
								
				if (pvalue.hasOwnProperty('ref'))
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": pvalue[this.nameField], "data": { "ref": pvalue.ref, "sig": null } }] };

				suggestions.push({
					label: pvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: pvalue[this.nameField],
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: pvalue.description,
					documentation: '',
					command: command
				});

			}

		}

	}

	/**
	 * Fills the suggestions for objects from bslGlobals 
	 * like classes or types
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 */
	getClassSuggestions(suggestions, obj) {

		if (obj.hasOwnProperty('methods')) {

			for (const [mkey, mvalue] of Object.entries(obj.methods)) {

				let description = mvalue.hasOwnProperty('returns') ? mvalue.returns : '';
				let signatures = this.getMethodsSignature(mvalue);
				let command = null;
				let postfix = '';				
				let post_action = null;

				if (signatures.length) {
					postfix = '(';
					post_action = 'editor.action.triggerParameterHints';
				}

				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';
				
				let ref = null;
				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref;

				if (ref || signatures.length) {					
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = {
						id: 'vs.editor.ICodeEditor:1:saveref',
						arguments: [
							{
								"name": mvalue[this.nameField],
								"data": {
									"ref": ref,
									"sig": signatures
								},
								"post_action": post_action
							}
						]
					};
				}

				suggestions.push({
					label:  mvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Method,
					insertText: mvalue[this.nameField] + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: mvalue.description,
					documentation: description,
					command: command
				});
	
			}

		}

		if (obj.hasOwnProperty('properties')) {

			for (const [pkey, pvalue] of Object.entries(obj.properties)) {
				
				let command = null;
								
				if (pvalue.hasOwnProperty('ref'))
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": pvalue[this.nameField], "data": { "ref": pvalue.ref, "sig": null } }] };

				suggestions.push({
					label: pvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: pvalue[this.nameField],
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: pvalue.description,
					documentation: '',
					command: command
				});

			}

		}

	}

	/**
	 * Fills array of completion for class methods, properties and
	 * system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} className name of class
	 */
	getClassCompletionByName(suggestions, data, className) {

		let classExists = false;

		if (className) {

			for (const [key, value] of Object.entries(data)) {

				if (value[this.nameField].toLowerCase() == className) {

					classExists = true;
					let values = [];

					this.getClassSuggestions(suggestions, value);
				
					if (value.hasOwnProperty('values')) {

						for (const [vkey, vvalue] of Object.entries(value.values)) {
							
							suggestions.push({
								label: vvalue[this.nameField],
								kind: monaco.languages.CompletionItemKind.Field,
								insertText: vvalue[this.nameField],
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								detail: vvalue.description,
								documentation: '',
								command: null
							});					

						}

					}
				
				}

			}

		}

		return classExists;

	}

	/**
	 * Fills array of completion for class names	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary	 
	 */
	 getClassNamesCompletion(suggestions, data) {

		let emptyString = (this.textBeforePosition.slice(0, -1).trim() === '');

		if (!emptyString) {

			for (const [key, value] of Object.entries(data)) {						
														
				let postfix = '';
				let signatures = this.getConstructSignature(value);
			
				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';

				suggestions.push({
					label: value[this.nameField],
					kind: monaco.languages.CompletionItemKind.Constructor,
					insertText: value[this.nameField] + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: value.description						
				});	

			}

		}

	 }

	/**
	 * Fills array of completion for class methods, properties and
	 * system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {boolean} onlyQuickAccess allow include in suggestions only elements with special property
	 */
	getClassCompletion(suggestions, data, onlyQuickAccess) {

		let classExists = false;
		let className = '';
		let exp = this.lastRawExpression;

		if (exp) {

			const match = Finder.findPreviousMatch(this.model, exp + '\\s*=\\s*(?:new|новый)\\s+([a-zA-Z\u0410-\u044F_]*)+[(;]', this.position);

			if (match) {										
				className = match.matches[match.matches.length - 1];
				className = className ? className.toLowerCase() : '';
			}
			else {			
				if (!this.lastExpressionHasSeparatedParams())
					className = exp;
			}
			
			if (onlyQuickAccess && (className == 'new' || className == 'новый')) {
				
				this.getClassNamesCompletion(suggestions, data, true)

			}
			else {

				classExists = this.getClassCompletionByName(suggestions, data, className);

				if (!classExists) {
					let unclosed = this.unclosedString(this.textBeforePosition);
					let regex = null;
					if (unclosed.string)
						regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(unclosed.string.slice(1));
					else
						regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(this.lastExpression);
					className = regex && 1 < regex.length ? regex[1] : '';
					if (!this.lastOperator && !this.hasWhitespace)
						classExists = this.getClassCompletionByName(suggestions, data, className);
				}

			}

		}

		return classExists;

	}

	/**
	 * Fills array of completion for external data sources
	 * 
	 * @param {object} parent parent of metadata object from BSL-JSON dictionary 
	 * @param {object} object metadata object from BSL-JSON dictionary
	 * @param {array} suggestions array of completion for object	 
	 */
	fillSuggestionsForExternalDataSources(parent, object, suggestions) {

		if (object.hasOwnProperty('tables')) {

			suggestions.push({
				label: parent[this.nameField + '_tables'],
				kind: monaco.languages.CompletionItemKind.Field,
				insertText: parent[this.nameField + '_tables'],
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
			});

			suggestions.push({
				label: parent[this.nameField + '_cubes'],
				kind: monaco.languages.CompletionItemKind.Field,
				insertText: parent[this.nameField + '_cubes'],
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
			});

		}

	}

	/**
 	 * Gets the list of methods owned by external data source
 	 * 
 	 * @param {array} suggestions the list of suggestions
 	 * @param {object} obj object from BSL-JSON dictionary
 	 * @param {sting} methodsName the name of node (objMethods, refMethods)
	 * @param {sting} dataType the type of table (ObjectData, NonobjectData)
 	 */
	getExternalDataSourcesMethods(suggestions, obj, methodsName, dataType) {

		if (obj.hasOwnProperty(methodsName)) {

			let signatures = [];

			for (const [mkey, mvalue] of Object.entries(obj[methodsName])) {

				if (!dataType || !mvalue.hasOwnProperty('tableDataType') || mvalue.tableDataType == dataType) {
					
					let command = null;
					let postfix = '';
					let post_action = null;

					signatures = this.getMethodsSignature(mvalue);

					if (signatures.length) {
						postfix = '(';
						post_action = 'editor.action.triggerParameterHints';
					}

					if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
						postfix = '()';

					let ref = null;
					if (mvalue.hasOwnProperty('ref'))
						ref = mvalue.ref;

					if (ref || signatures.length) {
						// If the attribute contains a ref, we need to run the command to save the position of ref
						command = {
							id: 'vs.editor.ICodeEditor:1:saveref',
							arguments: [
								{
									"name": mvalue[this.nameField],
									"data": {
										"ref": ref,
										"sig": signatures
									},
									"post_action": post_action
								}
							]
						}
					}

					suggestions.push({
						label: mvalue[this.nameField],
						kind: monaco.languages.CompletionItemKind.Function,
						insertText: mvalue.name + postfix,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						detail: mvalue.description,
						command: command
					});

				}

			}

		}

	}

	/**
	 * Gets the list of tables and cubes owned by external data source 
	 * 
	 * @param {string} metadataName metadata item type
	 * @param {string} metadataItem metadata item name
	 * @param {string} metadataObject metadata item object
	 * @param {array} suggestions array of completion for object	 
	 */
	getExternalDataSourcesCompletion(metadataName, metadataItem, metadataObject, suggestions) {

		if (bslMetadata.hasOwnProperty('externalDataSources') &&
			bslMetadata.externalDataSources.hasOwnProperty('items') &&
			bslMetadata.externalDataSources[this.nameField].toLowerCase() == metadataName) {

			for (const [key, value] of Object.entries(bslMetadata.externalDataSources.items)) {

				let objects_array = metadataObject.split('.').filter(e => e);
				let field_name = objects_array[0];
				let item_name = (1 < objects_array.length) ? objects_array[1] : '';
				let methods_name = '';

				if (key.toLowerCase() == metadataItem) {
					
					let item_node = null;

					if (bslMetadata.externalDataSources[this.nameField + '_tables'].toLowerCase() == field_name) {
						item_node = value.tables;
						methods_name = 'tablesMethods';
					}						
					else if (bslMetadata.externalDataSources.cubes[this.nameField + '_cubes'].toLowerCase() == field_name) {
						item_node = value.cubes;
						methods_name = 'cubesMethods';
					}

					if (item_node) {

						for (const [ikey, ivalue] of Object.entries(item_node.items)) {
							
							if (item_name) {
								if (ikey.toLowerCase() == item_name.toLowerCase()) {
									let data_type = ivalue.hasOwnProperty('tableDataType') ? ivalue.tableDataType : '';
									this.getExternalDataSourcesMethods(suggestions, bslMetadata.externalDataSources, methods_name, data_type);
								}
							}
							else {
								suggestions.push({
									label: ikey,
									kind: monaco.languages.CompletionItemKind.Unit,
									insertText: ikey,
									insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
								});
							}
						}

					}

				}

			}

		}

	}

	/**
	 * Gets the list of tabulars owned by object
	 * (Catalog, Document, etc) and fills the suggestions by it
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} tabulars object with tabulars description
	 */
	fillSuggestionsForItemTabulars(suggestions, tabulars, metadataName, metadataItem) {

		for (const [key, value] of Object.entries(tabulars)) {

			let command = {
				id: 'vs.editor.ICodeEditor:1:saveref',
				arguments: [{
					'name': key,
					"data": {
						"ref": 'universalObjects.ТабличнаяЧасть',
						"parent_ref": metadataName + '.' + metadataItem + '.tabulars.' + key,
						"sig": null
					}
				}]
			};

			suggestions.push({
				label: key,
				kind: monaco.languages.CompletionItemKind.Unit,
				insertText: key,
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
				command: command
			});

		}

	}

	/**
	 * Gets the list of properties (attributes) owned by object
	 * (Catalog, Document, etc) and fills the suggestions by it
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 */
	fillSuggestionsForMetadataItem(suggestions, obj, metadataName, metadataItem) {

		let objects = [];
		
		if (obj.hasOwnProperty('properties'))
			objects.push(obj.properties);

		if (obj.hasOwnProperty('resources'))
			objects.push(obj.resources);
		
		if (obj.hasOwnProperty('tabulars')) {
			this.fillSuggestionsForItemTabulars(suggestions, obj.tabulars, metadataName, metadataItem)
		}

		for (let idx = 0; idx < objects.length; idx++) {

			let metadataObj = objects[idx];

			for (const [pkey, pvalue] of Object.entries(metadataObj)) {
				
				let postfix = '';

				if (pvalue.hasOwnProperty('postfix')) {
					postfix = pvalue.postfix;
				}

				let command = null;
				let ref = pvalue.hasOwnProperty('ref') ? pvalue.ref : null;
				let nestedSuggestions = [];
								
				let detail = pvalue;
				let description = '';

				if (pvalue.hasOwnProperty('detail'))
					detail = pvalue.detail;
				else if (pvalue.hasOwnProperty('name'))
					detail = pvalue.name;

				if (pvalue.hasOwnProperty('description'))
					description = pvalue.description;				
				

				if (pvalue.hasOwnProperty('properties'))
					this.fillSuggestionsForMetadataItem(nestedSuggestions, pvalue, metadataName, metadataItem);

				if (pvalue.hasOwnProperty('methods'))
					this.getMetadataMethods(nestedSuggestions, pvalue, 'methods', null, null);

				if (ref || nestedSuggestions.length) {					
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{'name': pkey, "data": { "ref": ref, "sig": null, "list" : nestedSuggestions } }]}
				}

				if (typeof(detail) == 'object')
					detail = '';

				suggestions.push({
					label: pkey,
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: pkey + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: detail,
					documentation: description,
					command: command
				});
			}

		}

	}

	/**
	 * Looks metadata's method by name in certain types of methods
	 * like 'methods' (CatalogsManager, DocumentsManages),
	 * 'objMethods' - methods belong to the object
	 * 'refMethods' - methods belong to the ref
	 * 
	 * @param {object} metadataObj metadata objects from BSL-JSON dictionary
	 * @param {string} metadataFunc name of method (func)
	 * 
	 * @returns {object} object of method or false
	 */
	findMetadataMethodByName(metadataObj, methodsName, metadataFunc) {

		if (metadataObj.hasOwnProperty(methodsName)) {

			for (const [key, value] of Object.entries(metadataObj[methodsName])) {
				
				if (value[this.nameField].toLowerCase() == metadataFunc) {
					return value;
				}

			}

		}

		return false;

	}

	/**
	 * Finds metadata's method by name
	 * 
	 * @param {object} metadataObj metadata objects from BSL-JSON dictionary
	 * @param {string} metadataFunc name of method (func)
	 * 
	 * @returns {object} object of method or false
	 */
	getMetadataMethodByName(metadataObj, metadataFunc) {

		let method = this.findMetadataMethodByName(metadataObj, 'methods', metadataFunc);

		if (!method)
			method = this.findMetadataMethodByName(metadataObj, 'objMethods', metadataFunc);

		if (!method)
			method = this.findMetadataMethodByName(metadataObj, 'refMethods', metadataFunc);

		return method;

	}

	/**
	 * Fills array of completion for metadata subitem	like catalog of products
	 * by it's full definition like Документ.АвансовыйОтчет.НайтиПоНомеру()
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} metadataName metadata item type
	 * @param {string} metadataItem metadata item name
	 * @param {string} metadataFunc metadata item method
	 * 
	 * @returns {object} object exists or not and object ref type
	 */
	getMetadataItemCompletionFromFullDefinition(suggestions, data, metadataName, metadataItem, metadataFunc) {

		let itemExists = false;
		let refType = '';
		
		for (const [key, value] of Object.entries(data)) {

			if (value.hasOwnProperty(this.nameField)) {

				if (value[this.nameField].toLowerCase() == metadataName) {

					if (Object.keys(value.items).length) {

						for (const [ikey, ivalue] of Object.entries(value.items)) {

							if (ikey.toLowerCase() == metadataItem) {

								if (ivalue.hasOwnProperty('properties')) {

									let methodDef = this.getMetadataMethodByName(value, metadataFunc);
									let isObject = (methodDef && methodDef.hasOwnProperty('ref') && methodDef.ref.indexOf(':obj') != -1);
									let methodsName = isObject ? 'objMethods' : 'refMethods';

									let module_type = isObject ? 'object' : 'manager';
									
									if (!ivalue.hasOwnProperty(module_type))
										requestMetadata('module.' + module_type + '.' + metadataName.toLowerCase() + '.' + metadataItem.toLowerCase());

									itemExists = true;
									this.fillSuggestionsForMetadataItem(suggestions, ivalue, key, ikey);
									this.getMetadataMethods(suggestions, value, methodsName, key, ikey);

									if (isObject)
										this.getMetadataCommmonObjectProperties(suggestions, value);

									refType = key + '.' + ikey + (methodsName == 'objMethods' ? '.obj' : '');

									if (isObject)
										this.getMetadataGeneralMethodCompletionByType(ivalue, 'object', suggestions, 'Method');

								}
								else {

									requestMetadata(metadataName.toLowerCase() + '.' + metadataItem.toLowerCase());
									
								}
							}

						}

					}
					else {

						requestMetadata(metadataName.toLowerCase());

					}

				}

			}

		}

		return {itemExists: itemExists, refType: refType};

	}

	/**
	 * Fills array of completion for metadata subitem	like catalog of products
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary	 
	 */
	getMetadataItemCompletion(suggestions, data) {

		let itemExists = false;

		let exp = this.lastRawExpression;
		
		if (exp) {

			let fullText = this.getFullTextBeforePosition();
			let regex = null
			
			try {
				regex = new RegExp(exp + '\\s*=\\s*(.*)\\(.*\\);', 'gi');
				regex = regex.exec(fullText);
			}
			catch (e) {
				regex = null;
			}			
			
			if (regex && 1 < regex.length) {

				regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(regex[1]);

				let metadataName = regex && 1 < regex.length ? regex[1] : '';
				let metadataItem = regex && 2 < regex.length ? regex[2] : '';
				let metadataFunc = regex && 3 < regex.length ? regex[3] : '';

				if (metadataName && metadataItem && metadataFunc) {					
					let result = this.getMetadataItemCompletionFromFullDefinition(suggestions, data, metadataName, metadataItem, metadataFunc);
					itemExists = result.itemExists;
				}
			}

		}

		return itemExists;

	}

	/**
	 * Fills array of completion for metadata general fuctions
	 * by method type like 'method', 'manager'
	 * 
	 * @param {object} object metadata object from BSL-JSON dictionary
	 * @param {string} typeOfMethods type of method
	 * @param {array} suggestions array of completion for object
	 * @param {string} kind of suggestions (CompletionItemKind)
	 */
	getMetadataGeneralMethodCompletionByType(object, methodType, suggestions, kind) {

		if (object.hasOwnProperty(methodType)) {

			for (const [mkey, mvalue] of Object.entries(object[methodType])) {

				let description = mvalue.hasOwnProperty('returns') ? mvalue.returns : '';
				let signatures = this.getMethodsSignature(mvalue);
				
				let postfix = '';
				let command = null;
				let ref = null;

				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref;

				if (ref || signatures.length) {
					postfix = '(';
					command = {
						id: 'vs.editor.ICodeEditor:1:saveref',
						arguments: [
							{
								"name": mvalue[this.nameField],
								"data": {
									"ref": ref,
									"sig": signatures
								},
								"post_action": 'editor.action.triggerParameterHints'
							}
						]
					}
				}

				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';

				suggestions.push({
					label: mvalue[this.nameField],
					kind: monaco.languages.CompletionItemKind[kind],
					insertText: mvalue[this.nameField] + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: mvalue.description,
					documentation: description,
					command: command
				});

			}

		}

	}

	/**
	 * Fills array of completion for metadata item like Catalogs,
	 * Documents, InformationRegisters, etc.
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 */
	getMetadataCompletion(suggestions, data) {

		let metadataExists = false;

		let unclosed = this.unclosedString(this.textBeforePosition);
		let expression = this.lastExpression;

		if (unclosed.string) {
			let exp = unclosed.string.slice(1);
			expression = exp.split(' ').pop();
		}

		let regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(expression);
		
		let metadataName = regex && 1 < regex.length ? regex[1] : '';
		let metadataItem = regex && 2 < regex.length ? regex[2] : '';
		let metadataFunc = regex && 3 < regex.length ? regex[3] : '';

		let updateItemNode = false;
		
		if (metadataName && !metadataFunc) {

			for (const [key, value] of Object.entries(data)) {

				if (value.hasOwnProperty(this.nameField)) {

					if (value[this.nameField].toLowerCase() == metadataName) {

						metadataExists = true;
						let values = [];
						let itemNode = null;

						if (metadataName) {

							for (const [ikey, ivalue] of Object.entries(value.items)) {

								if (ikey.toLowerCase() == metadataItem) {
									itemNode = ivalue;
									break;
								}

							}

						}

						if (itemNode) {

							updateItemNode = !itemNode.hasOwnProperty('properties');

							if (itemNode.hasOwnProperty('predefined')) {

								for (const [pkey, pvalue] of Object.entries(itemNode.predefined)) {
															
									values.push({
										name: pvalue ? pvalue : pkey,
										insertText: pkey,
										postfix: '',
										detail: '',
										description: '',
										kind: monaco.languages.CompletionItemKind.Field,
										insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
										command: null
									});
																									
								}

							}

							this.getMetadataGeneralMethodCompletionByType(value, 'methods', suggestions, 'Method');
							this.fillSuggestionsForExternalDataSources(value, itemNode, suggestions);

							if (!updateItemNode) {
								if (itemNode.hasOwnProperty('manager'))									
									this.getMetadataGeneralMethodCompletionByType(itemNode, 'manager', suggestions, 'Method');
								else
									requestMetadata('module.manager.' + metadataName + '.' + metadataItem);
							}
							
							if (key == 'enums') {
								this.fillSuggestionsForMetadataItem(suggestions, itemNode, metadataName, metadataItem)
							}

						} else {

							if (Object.keys(value.items).length) {

								for (const [ikey, ivalue] of Object.entries(value.items)) {
									values.push({
										name: ikey,
										detail: '',
										description: '',
										postfix: '',
										kind: monaco.languages.CompletionItemKind.Field,
										command: null
									});
								}

							}
							else {
								requestMetadata(metadataName);
							}

						}

						values.forEach(function (value) {

							suggestions.push({
								label: value.name,
								kind: value.kind,
								insertText: value.insertText ? value.insertText : value.name + value.postfix,
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								detail: value.detail,
								documentation: value.description,
								command: value.command
							});

						});

					}
				}

			}

			if (updateItemNode) {
				requestMetadata(metadataName + '.' + metadataItem);
				suggestions = [];
			}
			else if (metadataName && metadataExists && !metadataItem && !suggestions.length)				
				requestMetadata(metadataName);

		}
		else if (metadataFunc) {
			this.getExternalDataSourcesCompletion(metadataName, metadataItem, metadataFunc, suggestions);
		}

		if (!metadataExists)
			metadataExists = this.getMetadataItemCompletion(suggestions, data);

		return metadataExists;

	}

	/**
	 * Gets call stack for variable
	 * 
	 * @param {string} varName name of variable
	 * @param {IPosition} position the position of variable
	 * 
	 * @returns {array} call stack array
	 */
	getMetadataStackForVar(varName, position) {

		let stack = [];
		let pattern_match_count = 4;
		let match = Finder.findPreviousMatch(this.model, '(' + varName + '\\s*=\\s*(.*?))\\.(.*)', position, false);

		if (match && match.matches.length == pattern_match_count) {

			if (match.range.startLineNumber < position.lineNumber) {
				
				let source_var = match.matches[2];
				let column = match.range.startColumn + match.matches[1].length;

				stack.push({
					var: source_var.toLowerCase(),					
					line: match.range.startLineNumber,
					previous_ref: true,
					column: column
				});

				let source_exp = match.matches[3];
				let source_arr = source_exp.split('(');				
				let exp_arr = source_arr[0].split('.');

				for(let i = 0; i < exp_arr.length; i++) {
					
					let expression = exp_arr[i];
					expression = expression.replace(/[;]/g, '');
					column += expression.length + 1;

					let index_read = /(.+?)(\[\d+\])/.exec(expression);

					if (index_read) {
						stack.push(
							{
								var: index_read[1].toLowerCase(),
								line: match.range.startLineNumber,
								previous_ref: false,
								column: column - index_read[2].length
							},
							{
								var: engLang ? 'get' : 'получить',
								line: match.range.startLineNumber,
								previous_ref: false,
								column: column
							}
						);
					}
					else {
						stack.push({
							var: expression.toLowerCase(),
							line: match.range.startLineNumber,
							previous_ref: false,
							column: column
						});
					}

				}				
				
				let prev_stack = this.getMetadataStackForVar(source_var, new monaco.Position(position.lineNumber, match.range.startColumn));
				stack = prev_stack.concat(stack);

			}			

		}
		else {

			let var_match = Finder.findPreviousMatch(this.model, varName + '((?:\(.*\)|\[\d+\])?)*\.', position, false);
			
			if (var_match) {

				let offset = var_match.range.startColumn - 1;
				let range = new monaco.Range(position.lineNumber, offset, position.lineNumber, offset + 1);
				let char = this.model.getValueInRange(range);
				let prev_var = this.model.getWordUntilPosition(new monaco.Position(position.lineNumber, offset));

				if (char == '.' && prev_var) {
					stack.push({
						var: varName,
						line: position.lineNumber,
						previous_ref: false,
						column: var_match.range.startColumn + varName.length
					});
					if (var_match.matches[1] && var_match.matches[1].indexOf('[') == 0)
						stack.push({
							var: engLang ? 'get' : 'получить',
							line: position.lineNumber,
							previous_ref: false,
							column: position.column - 1
						});
					let prev_position = new monaco.Position(position.lineNumber, offset + 1);
					let prev_stack = this.getMetadataStackForVar(prev_var.word.toLowerCase(), prev_position);
					stack = prev_stack.concat(stack);
				}

			}

		}

		return stack;

	}

	/**
	 * Saves context data for variable
	 * 
	 * @param {string} expression name of variable
	 * @param {string} ref type of ref
	 * @param {int} line number line
	 * @param {string}  parentRef ref to parent like catalogs.Товары.tabulars.ДополнительныеРеквизиты
	 * 
	 * @returns {object} object containing the ref
	 */
	setContextDataForRefExpression(expression, ref, line, parentRef) {
												
		let lineContextData = contextData.get(line);
		
		if (!lineContextData) {
			contextData.set(line, new Map());
		}

		lineContextData = contextData.get(line);
		let data = {
			"ref": ref,
			"parent_ref": parentRef,
			"sig": null
		};
		lineContextData.set(expression, data);

		return data;

	}

	/**
	 * Saves context data for stack item
	 * when suggestions list contains it
	 * 
	 * @param {object} item item of stack
	 * @param {array} suggestions array of suggections
	 * 
	 * @returns {object} object containing the ref or null
	 */
	setContextDataForStackItem(item, suggestions) {

		let exp_name = item.var;		

		for(let i = 0; i < suggestions.length; i++) {
			
			let suggestion = suggestions[i];

			if (suggestion.label.toLowerCase() == exp_name) {
				
				let command = suggestion.command;

				if (command && command.id =='vs.editor.ICodeEditor:1:saveref') {
																	
					return this.setContextDataForRefExpression(exp_name, command.arguments[0].data.ref, item.line, command.arguments[0].data.parent_ref);

				}
				
			}
			
		}

		return null;

	}

	/**
	 * Checks if item from stack is Custom object
	 * and saves context data for it's property
	 * 
	 * @param {array} stack call stack array
	 * @param {object} item item item of stack
	 * @param {int} index current index of item in stack
	 */
	setContextDataForCustomObjectFromStack(stack, item, index) {

		for (const [key, value] of Object.entries(bslMetadata.customObjects.items)) {

			if (key.toLowerCase() == item.var) {

				for (const [pkey, pvalue] of Object.entries(value.properties)) {

					let property = pvalue.name.toLowerCase();
					if (property == stack[index + 1].var && pvalue.hasOwnProperty('ref'))
						this.setContextDataForRefExpression(property, pvalue.ref, item.line);

				}

			}

		}

	}

	/**
	 * Fill suggestions from call stack when variable
	 * define like Спр = Справочники.Номенклатура.НайтиПоКоду
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {array} stack call stack array
	 * 
	 * @returns {bool} object exists or not
	 */
	getMetadataStackCompletionFromFullDefinition(suggestions, stack) {

		let itemExists;
		let min_stack_size  = 4; // min stack size when variable define like Спр = Справочники.Номенклатура.НайтиПоКоду
		
		if (min_stack_size < stack.length) {
			
			let metadata_suggestions = [];

			let metadataName = stack[0].var;
			let metadataItem = stack[1].var;
			let metadataFunc = stack[2].var;
			let result = this.getMetadataItemCompletionFromFullDefinition(metadata_suggestions, bslMetadata, metadataName, metadataItem, metadataFunc);
			itemExists = result.itemExists;			

			if (itemExists) {

				let prev_ref = null;

				for(let i = 3; i < stack.length; i++) {
				
					let stack_item = stack[i];
					if (i == 3) {
						metadata_suggestions.forEach((suggest) => {
							if (suggest.label.toLowerCase() == stack_item.var) {
								let command_data = suggest.command.arguments[0].data;
								prev_ref = this.setContextDataForRefExpression(
									stack_item.var,
									command_data.ref,
									stack_item.line,
									command_data.parent_ref
								);
							}
						})
						if (!prev_ref)
							prev_ref = this.setContextDataForRefExpression(stack_item.var, result.refType, stack_item.line);
					}
					else {
						metadata_suggestions = [];
						if (stack_item.previous_ref && prev_ref != null) {
							prev_ref = this.setContextDataForRefExpression(stack_item.var, prev_ref.ref, stack_item.line)
						}
						else {
							let prev_item = stack[i - 1];
							let position = new monaco.Position(prev_item.line, prev_item.column + 1);
							this.getRefCompletionFromPosition(metadata_suggestions, position, false);
							prev_ref = this.setContextDataForStackItem(stack_item, metadata_suggestions);
						}
					}

					if (i + 1 == stack.length) {
						this.getRefCompletion(suggestions);
					}

				}

			}

		}

		return itemExists;
	
	}

	/**
	 * Fill suggestions from call stack when variable
	 * define like ref (catalogs.Товары)
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {array} stack call stack array
	 * 	 
	 */
	getStackCompletionFromRefs(suggestions, stack) {

		let prev_ref = null;

		for (let i = 0; i < stack.length; i++) {

			let stack_item = stack[i];
			let metadata_suggestions = [];

			if (stack_item.previous_ref && prev_ref != null) {
				prev_ref = this.setContextDataForRefExpression(stack_item.var, prev_ref.ref, stack_item.line);
			}
			else {
				let position = new monaco.Position(stack_item.line, stack_item.column + 1);
				if (0 < i) {
					let prev_item = stack[i - 1];
					position = new monaco.Position(prev_item.line, prev_item.column + 1);
				}
				if (i == 0) {
					prev_ref = this.getRefCompletionFromPosition(metadata_suggestions, position, false);
					if (!prev_ref && i + 1 < stack.length && bslMetadata.customObjects.hasOwnProperty('items'))
						this.setContextDataForCustomObjectFromStack(stack, stack_item, i);
				}
				else {
					this.getRefCompletionFromPosition(metadata_suggestions, position, false);
					if (!metadata_suggestions.length && i == 1)
						this.getClassCompletionByName(metadata_suggestions, bslGlobals.classes, stack[i - 1].var);
					prev_ref = this.setContextDataForStackItem(stack_item, metadata_suggestions);
				}
			}

			if (i + 1 == stack.length) {
				this.getRefCompletion(suggestions);
			}

		}

	}

	/**
	 * Constructs completion using stack of all variables,
	 * methods and properties that preceded the object
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 */
	 getStackCompletion(suggestions) {

		let exp = this.lastRawExpression;		
		let stack = this.getMetadataStackForVar(exp, this.position, false);
		let itemExists = this.getMetadataStackCompletionFromFullDefinition(suggestions, stack);		

		if (!itemExists) {
			this.getStackCompletionFromRefs(suggestions, stack);
		}

	}

	/**
	 * Fills array of completion for types	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getTypesCompletion(suggestions, data, kind) {

		let subType = this.getLastNExpression(2);

		for (const [key, value] of Object.entries(data)) {

			if (!subType) {

				let suggestion = {
					label: key,
					kind: kind,
					insertText: key,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
				}

				if (value.hasOwnProperty('ref')) {
					suggestion.insertText += '.';
					suggestion['command'] = { id: 'editor.action.triggerSuggest', title: 'suggest_type' };
				}
				else {
					suggestion.insertText += '"';
				}

				suggestions.push(suggestion);

			}
			else {

				if (key.toLowerCase() == subType) {

					if (value.hasOwnProperty('ref') && bslMetadata.hasOwnProperty(value.ref) && bslMetadata[value.ref].hasOwnProperty('items')) {
					
						if (Object.keys(bslMetadata[value.ref].items).length) {

							for (const [mkey, mvalue] of Object.entries(bslMetadata[value.ref].items)) {

								suggestions.push({
									label: mkey,
									kind: kind,
									insertText: mkey + '"',
									insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								});

							}
						}
						else {
							requestMetadata(bslMetadata[value.ref].name.toLowerCase());
						}
					}
				}

			}
			
		}

	}

	/**
	 * Looks for variables with assigned a value
	 * 
	 * @param {int} currentLine the last line below which we don't search variables
	 * 
	 * @returns {array} array with variables names
	 */
	getAssignedVarsNames(currentLine) {

		let names = [];
		let comments = new Map();

		const commentMatches = Finder.findMatches(this.model, '\\/\\/');

		for (let idx = 0; idx < commentMatches.length; idx++) {
			comments.set(commentMatches[idx].range.startLineNumber, commentMatches[idx].range.startColumn);
		}

		let matches = Finder.findMatches(this.model, '([a-zA-Z0-9\u0410-\u044F_]+)\\s*=\\s*.*(?:;|\\()\\s*$');

		for (let idx = 0; idx < matches.length; idx++) {

			let match = matches[idx];

			if (match.range.startLineNumber < currentLine || currentLine == 0) {

				let comment = comments.get(match.range.startLineNumber);

				if (!comment || match.range.startColumn < comment) {

					let varName = match.matches[match.matches.length - 1]

					if (!names.some(name => name === varName))
						names.push(varName);

				}

			}

		}

		return names;

	}

	/**
	 * Looks for variables into function definition
	 * 	 
	 * @param {int} currentLine the last line below which we don't search variables
	 * @param {int} a line number where function is defined
	 * 
	 * @returns {array} array with variables names
	 */
	getFunctionsVarsNames(currentLine, funcLine) {

		let names = [];
		let matches = Finder.findMatches(this.model, '(?:процедура|функция|procedure|function)\\s+[a-zA-Z0-9\u0410-\u044F_]+\\(([a-zA-Z0-9\u0410-\u044F_,\\s=]+)\\)');

		for (let idx = 0; idx < matches.length; idx++) {

			let match = matches[idx];

			if (match.range.startLineNumber < currentLine || currentLine == 0) {

				let params = match.matches[1].split(',');

				params.forEach(function (param) {
					let paramName = param.split('=')[0].trim();
					if (!names.some(name => name === paramName))
						names.push(paramName);
				});

				if (0 < currentLine)
					funcLine = match.range.startLineNumber;

			}

		}

		return names;

	}

	/**
	 * Looks for variables with default definition
	 * 
	 * @param {int} currentLine the last line below which we don't search variables
	 * @param {int} a line number where function is defined
	 * 
	 * @returns {array} array with variables names
	 */
	getDefaultVarsNames(currentLine, funcLine) {

		let names = [];
		let matches = Finder.findMatches(this.model, '(?:перем|var)\\s+([a-zA-Z0-9\u0410-\u044F_,\\s]+);');

		for (let idx = 0; idx < matches.length; idx++) {

			let match = matches[idx];

			if (currentLine == 0 || (funcLine < match.range.startLineNumber && match.range.startLineNumber < currentLine)) {

				let varDef = match.matches[match.matches.length - 1];

				const params = varDef.split(',');

				params.forEach(function (param) {
					let paramName = param.split('=')[0].trim();
					if (!names.some(name => name === paramName))
						names.push(paramName);
				});

			}

		}

		return names;

	}

	/**
	 * Fills and returns array of variables names
	 * 
	 * @param {int} currentLine the last line below which we don't search variables
	 * 
	 * @returns {array} array with variables names
	 */
	getVarsNames(currentLine) {

		let names = this.getAssignedVarsNames(currentLine);

		let funcLine = 0;
		names = names.concat(this.getFunctionsVarsNames(currentLine, funcLine));
		names = names.concat(this.getDefaultVarsNames(currentLine, funcLine));

		return names;

	}

	/**
	 * Fills array of completion for variables
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 */
	getVariablesCompetition(suggestions) {

		if (this.word) {

			let names = this.getVarsNames(this.lineNumber);

			for (let idx = 0; idx < names.length; idx++) {

				let varName = names[idx];

				if (varName.toLowerCase().startsWith(this.word)) {
					suggestions.push({
						label: varName,
						kind: monaco.languages.CompletionItemKind.Variable,
						insertText: varName,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet					
					});
				}				

			}

		}

	}

	/**
	 * Fills completions for object's methods and properties
	 * into expressions like 'Types = New Array; Types.Cou<-(unt)'
	 * 
	 * @param {array} array of suggestions for provideCompletionItems
	 * @param {CompletionContext} context
	 * @param {CancellationToken} token
	 */
	getCompletionForCurrentObject(suggestions, context, token) {

		if (!suggestions.length && this.getLastNExpression(1) == '.' && this.getLastCharacter() != '.') {
			
			let column = this.column - this.lastRawExpression.length;
			let position = new monaco.Position(this.lineNumber, column);
			let bsl = new bslHelper(this.model, position);			
			let object_suggestions = bsl.getCodeCompletion(context, token);

			object_suggestions.forEach(suggest => {
				suggestions.push(suggest);
			});			

		}

	}

	/**
	 * Fills suggestions for names of common modules
	 *
	 * @param {array} array of suggestions for provideCompletionItems
	 */
	getCommonModulesNameCompletion(suggestions) {

		if (this.word) {

			for (const [key, value] of Object.entries(bslMetadata.commonModules.items)) {

				if (key.toLowerCase().startsWith(this.word)) {
					suggestions.push({
						label: key,
						kind: monaco.languages.CompletionItemKind.Module,
						insertText: key,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
					});
				}

			}

		}

	}

	/**
	 * Fills suggestions for a specific common module
	 *
	 * @param {array} array of suggestions for provideCompletionItems
	 */
	getCommonModulesFuncCompletion(suggestions) {

		let module_name = this.getLastNExpression(2);

		if (module_name) {

			for (const [key, value] of Object.entries(bslMetadata.commonModules.items)) {

				if (key.toLowerCase() == module_name) {

					if (Object.keys(value).length) {

						for (const [mkey, mvalue] of Object.entries(value)) {

							if (mvalue.hasOwnProperty(this.nameField)) {

								let command = null;
								let postfix = '';
								let post_action = null;
								let signatures = this.getMethodsSignature(mvalue);

								if (signatures.length) {
									postfix = '(';
									post_action = 'editor.action.triggerParameterHints';
								}

								if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
									postfix = '()';								

								let ref = null;
								if (mvalue.hasOwnProperty('ref'))
									ref = mvalue.ref;

								if (ref || signatures.length) {
									command = {
										id: 'vs.editor.ICodeEditor:1:saveref',
										arguments: [
											{
												"name": mvalue[this.nameField],
												"data": {
													"ref": ref,
													"sig": signatures
												},
												"post_action": post_action
											}
										]
									}
								}

								let template = mvalue.hasOwnProperty('template') ? mvalue.template : '';

								suggestions.push({
									label: mvalue[this.nameField],
									kind: monaco.languages.CompletionItemKind.Function,
									insertText: template ? template : mvalue[this.nameField] + postfix,
									insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
									detail: mvalue.detail,
									documentation: mvalue.description,
									command: command
								});

							}

						}
					}
					else {
						requestMetadata('module.' + module_name);
					}

				}

			}

		}

	}

	/**
	 * Fills suggestions for common modules (list of modules and specific module)
	 *
	 * @param {array} array of suggestions for provideCompletionItems
	 */
	getCommonModulesCompletion(suggestions) {

		if (this.getLastNExpression(1) == '.')
			this.getCommonModulesFuncCompletion(suggestions);
		else
			this.getCommonModulesNameCompletion(suggestions);

	}

	/**
	 * Determines accessibility of completition
	 *
	 * @returns {bool} the accessibility of completition at the moment
	 */
	completionIsAvailable() {

		let available = (this.lastOperator != '"');
		let isComment = (0 <= this.token.search('comment'));

		if (available && isComment) {
			let ctrlSpaceTrigger = (ctrlPressed && editor.lastKeyCode == 10);
			available = ctrlSpaceTrigger;
		}

		return available;

	}
	
	/**
	 * Completion provider for code-mode
	 * 
	 * @param {CompletionContext} context
	 * @param {CancellationToken} token
	 * 
	 * @returns {array} array of completion
	 */
	getCodeCompletion(context, token) {

		let suggestions = [];

		if (context.triggerCharacter && context.triggerCharacter == ' ') {
			
			this.getClassCompletion(suggestions, bslGlobals.classes, true);

		}
		else 
		{

			if (!this.requireType()) {

				if (this.completionIsAvailable()) {

					this.getRefCompletion(suggestions);
					this.getCompletionForCurrentObject(suggestions, context, token);

					if (!suggestions.length) {

						if (!this.getClassCompletion(suggestions, bslGlobals.classes, false)) {

							if (!this.getClassCompletion(suggestions, bslGlobals.systemEnum, false)) {

								if (!this.getMetadataCompletion(suggestions, bslMetadata)) {

									if (!suggestions.length)
										this.getVariablesCompetition(suggestions);

									if (engLang)
										this.getCommonCompletion(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);
									else
										this.getCommonCompletion(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);

									if (this.requireClass()) {
										this.getClassNamesCompletion(suggestions, bslGlobals.classes, false);
									}
									else {
										this.getCommonCompletion(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function, true);
										this.getCommonCompletion(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class, true);
										this.getCommonCompletion(suggestions, bslGlobals.systemEnum, monaco.languages.CompletionItemKind.Enum, false);
										this.getCommonCompletion(suggestions, bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function, true);
										this.getCommonModulesCompletion(suggestions);
										this.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
									}

									this.getSnippets(suggestions, snippets, false);

								}

							}

						}
					}

					if (!suggestions.length)
						this.getStackCompletion(suggestions);

					if (!suggestions.length)
						this.getMetadataDescription(suggestions);

				}

			}

		}

		return suggestions;

	}

	/**
	 * Completion provider
	 * 
	 * @param {CompletionContext} context
	 * @param {CancellationToken} token
	 * 
	 * @returns {array} array of completion
	 */
	getCompletion(context, token) {

		let suggestions = this.getCustomSuggestions(true);

		if (!suggestions.length && !editor.disableNativeSuggestions) {

			if (!this.isItStringLiteral()) {				
				suggestions = this.getCodeCompletion(context, token);
			}
			else {
				if (this.requireType())
					this.getTypesCompletion(suggestions, bslGlobals.types, monaco.languages.CompletionItemKind.Enum);
			}

		}

		if (suggestions.length)
			return { suggestions: suggestions }
		else
			return [];

	}

	/**
	 * Computing completion item oа its first activation
	 * at the suggestion list
	 * 
	 * @param {completionItem} completionItem current item of suggestion list 
	 * 
	 * @returns {completionItem} computed completion item
	 */
	resolveCompletionItem(completionItem) {

		if (completionItem.kind == monaco.languages.CompletionItemKind.Snippet) {
			completionItem.guid = this.guid();
			completionItem.insertText = this.prepareSnippetCode(completionItem.insertText, completionItem);
		}

		return completionItem

	}

	/**
	 * Fills array of completion for query values	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryValuesCompletion(suggestions, data, kind) {

		let expArray = this.getExpressioArray();

		if (expArray) {

			let regex = /\((.*?)\.(?:(.*?)\.)?/.exec(expArray[expArray.length - 1]);
			let metadataName = regex && 1 < regex.length ? regex[1] : '';
			let metadataItem = regex && 2 < regex.length ? regex[2] : '';			

			for (const [key, value] of Object.entries(data)) {

				if (!metadataName) {

					let suggestion = {
						label: key,
						kind: kind,
						insertText: key,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
					}

					if (value.hasOwnProperty('ref') || value.hasOwnProperty('items')) {
						suggestion.insertText += '.';
						suggestion['command'] = { id: 'editor.action.triggerSuggest', title: 'suggest_type' };
					}

					suggestions.push(suggestion);

				}
				else {

					if (key.toLowerCase() == metadataName) {

						if (value.hasOwnProperty('ref') && bslMetadata.hasOwnProperty(value.ref) && bslMetadata[value.ref].hasOwnProperty('items')) {

							if (metadataItem) {

								for (const [mkey, mvalue] of Object.entries(bslMetadata[value.ref].items)) {

									if (mkey.toLowerCase() == metadataItem) {

										if (value.ref == 'enums' && mvalue.hasOwnProperty('properties')) {

											for (const [ikey, ivalue] of Object.entries(bslMetadata[value.ref].items[mkey].properties)) {
												suggestions.push({
													label:  ikey,
													kind: kind,
													insertText: ikey + ')',
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
												});
											}

										}
										else if (mvalue.hasOwnProperty('predefined')) {
											
											for (const [pkey, pvalue] of Object.entries(bslMetadata[value.ref].items[mkey].predefined)) {
												suggestions.push({
													label:  pvalue ? pvalue : pkey,
													kind: kind,
													insertText: pkey + ')',
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
												});
											}
										}
										else {
											requestMetadata(bslMetadata[value.ref].name.toLowerCase() + '.' + metadataItem);
										}

										let EmptyRef = engLang ? 'EmptyRef' : 'ПустаяСсылка';

										suggestions.push({
											label:  EmptyRef,
											kind: kind,
											insertText: EmptyRef + ')',
											insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
										});

									}

								}

							}
							else {


								if (!Object.keys(bslMetadata[value.ref].items).length) {									
									requestMetadata(bslMetadata[value.ref].name.toLowerCase());
								}
								else {
								
									for (const [mkey, mvalue] of Object.entries(bslMetadata[value.ref].items)) {

										suggestions.push({
											label: mkey,
											kind: kind,
											insertText: mkey + '.',
											insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
											command: { id: 'editor.action.triggerSuggest', title: 'suggest_type' }
										});

									}

								}

							}
						}
						else if (value.hasOwnProperty('items')) {
							
							for (const [ikey, ivalue] of Object.entries(value.items)) {							
								suggestions.push({
									label: ikey,
									kind: kind,
									insertText: ikey + ')',
									insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet									
								});
							};
														
						}

					}

				}

			}

		}

	}

	/**
	 * Fills array of completion from array	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {array} values array of values
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 * @param {bool} upperCase turn expression into upper case or not
	 */
	 getFillSuggestionsFromArray(suggestions, values, kind, upperCase) {

		let word = this.word;

		if (word) {

			values.forEach(function (value) {

				if (value.toLowerCase().startsWith(word)) {

					let expression = value;

					if (upperCase)
						value = value.toUpperCase();

					if (engLang) {
						if (!/^[A-Za-z]*$/.test(expression))
							expression = '';
					}
					else {
						if (/^[A-Za-z]*$/.test(expression) && expression.indexOf('NULL') == -1)
							expression = '';
					}

					if (expression && !suggestions.some(suggest => suggest.label === expression)) {						
						suggestions.push({
							label: expression,
							kind: kind,
							insertText: expression,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet						
						});
					}
				}

			});

		}

	}

	/**
	 * Compares two versions each other
	 * @param {string} version1 
	 * @param {string} version2 
	 * @returns {int}
	 */
	compareVersions(version1, version2) {

		let res = -1;

		let verArr1 = version1.split('.');
		let verArr2 = version2.split('.');

		let idx = 0;

		for (let idx = 0; idx < 3; idx++) {
			res = parseInt(verArr1[idx]) - parseInt(verArr2[idx]);
			if (res != 0)
				return res;
		}

		return res;

	}

	/**
	 * Determines if the current version 1c is bigger or equal
	 * version from param
	 * @param {string} version 
	 * @returns {bool}
	 */
	currentVersionIsMatch(version) {

		return 0 <= this.compareVersions(version1C, version);

	}

	/**
	 * Returns query functions depending on current version of 1C
	 * @param {object} bslQueryDef query definition like bslQuery or bslDCS 
	 * @returns {object}
	 */
	getQueryFunctions(bslQueryDef) {

		let functions = Object.assign({}, bslQueryDef.functions);

		for (const [key, value] of Object.entries(bslQueryDef)) {

			if (0 <= key.indexOf('functions_')) {

				let start_ver = key.replace('functions_', '').replace(/_/g, '.');

				if (this.currentVersionIsMatch(start_ver)) {
					Object.assign(functions, value);
				}

			}

		}

		return functions;

	}

	/**
 	 * Returns query expressions depending on current version of 1C
	 * @param {object} langDef query language definition
 	 * @returns {object}
 	 */
	getQueryExpressions(rules) {

		let expressions = [...rules.queryExp];

		for (const [key, value] of Object.entries(rules)) {

			if (0 <= key.indexOf('queryExp_')) {

				let start_ver = key.replace('queryExp_', '').replace(/_/g, '.');

				if (this.currentVersionIsMatch(start_ver)) {

					value.forEach(function (expression) {					
						expressions.push(expression);
					});

				}

			}

		}

		return expressions;

	}

	/**
 	 * Returns query keywords depending on current version of 1C
	 * @param {object} langDef query language definition
 	 * @returns {object}
 	 */
	 getQueryKeywords(rules) {

		let keywords = [...rules.queryWords];

		for (const [key, value] of Object.entries(rules)) {

			if (0 <= key.indexOf('queryWords_')) {

				let start_ver = key.replace('queryWords_', '').replace(/_/g, '.');

				if (this.currentVersionIsMatch(start_ver)) {

					value.forEach(function (keyword) {					
						keywords.push(keyword);
					});

				}

			}

		}

		return keywords;

	}

	/**
	 * Fills array of completion for query language`s keywords
	 * and expressions
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} langDef query language definition
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryCommonCompletion(suggestions, kind) {	

		let word = this.word;

		if (word) {

			let values = []			
			let rules = languages.bsl.languageDef.rules;

			let keywords = this.getQueryKeywords(rules);
			for (const [key, keyword] of Object.entries(keywords)) {
				values.push(keyword);
			}

			let expressions = this.getQueryExpressions(rules);			
			for (const [key, keyword] of Object.entries(expressions)) {
				values.push(keyword);
			}

			this.getFillSuggestionsFromArray(suggestions, values, kind, true);

		}

	}

	/**
	 * Fills array of completion for params of query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryParamsCompletion(suggestions, kind) {	

		if (this.lastRawExpression.startsWith('&')) {
		
			const matches = Finder.findMatches(this.model, '&([a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*)[\\s\\n,\)]')

			for (let idx = 0; idx < matches.length; idx++) {

				let match = matches[idx];
				let paramName = match.matches[match.matches.length - 1];
				
				if (paramName && !suggestions.some(suggest => suggest.insertText === paramName)) {
					suggestions.push({
						label: '&' + paramName,
						kind: kind,
						insertText: paramName,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet						
					});
				}

			}

		}

	}

	/**
	 * Returns subresources for the virtual table type
	 * 
	 * @param {string} subTable subtable name like balance, turnovers, periodical
	 * @param {string} regType type of subtable like balance, turnovers, periodical
	 *	 
	 * @returns {array} array of subresources
	 */
	getGetVirtualTableSubresouces(subTable, regType) {

		let subresouces = {};

		if (engLang) {

			if (subTable == 'balance') {
				subresouces = {				
					"Balance": "(balance)"
				};
			}
			else if (subTable == 'turnovers') {
				if (regType == 'balance')
					subresouces = {
						"Receipt": "(receipt)",
						"Expense": "(expense)",
						"Turnover": "(turnover)"
					};
				else
					subresouces = {
						"Turnover": "(turnover)"
					};

			}
			else if (subTable == 'balanceandturnovers') {
				subresouces = {
					"OpeningBalance": "(opening balance)",
					"Receipt": "(receipt)",
					"Expense": "(expense)",
					"Turnover": "(turnover)",
					"ClosingBalance": "(closing balance)"
				};
			}			

		}
		else {

			if (subTable == 'остатки') {
				subresouces = {
					"Остаток": "(остаток)"
				};
			}
			else if (subTable == 'обороты') {
				if (regType == 'balance')
					subresouces = {					
						"Приход": "(приход)",
						"Расход": "(расход)",
						"Оборот": "(оборот)"
					};
				else
					subresouces = {
						"Оборот": "(оборот)"
					};
			}
			else if (subTable == 'остаткииобороты') {
				subresouces = {					
					"НачальныйОстаток": "(начальный остаток)",
					"Приход": "(приход)",
					"Расход": "(расход)",
					"Оборот": "(оборот)",
					"КонечныйОстаток": "(конечный остаток)"
				};
			}			

		}

		return subresouces;

	}

	/**
	 * Gets the list of properties (attributes) owned by object
	 * (Catalog, Document, etc) and fills the suggestions by it
	 * Used only for query-mode
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 * @param {metadataSubtable} string name of subtable such as tabular sections
	 * or virtual table
	 */
	fillSuggestionsForMetadataItemInQuery(suggestions, obj, metadataSubtable) {

		for (const [pkey, pvalue] of Object.entries(obj.properties)) {
							
			let command = null;
			let ref = pvalue.hasOwnProperty('ref') ? pvalue.ref : null;
			let nestedSuggestions = [];
							
			let detail = pvalue;

			if (pvalue.hasOwnProperty('description'))
				detail = pvalue.description;				
			else if (pvalue.hasOwnProperty('name'))
				detail = pvalue.name;
			
			if (ref || nestedSuggestions.length) {					
				// If the attribute contains a ref, we need to run the command to save the position of ref
				command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{'name': pkey, "data": { "ref": ref, "sig": null, "list" : nestedSuggestions } }]}
			}

			suggestions.push({
				label: pkey,
				kind: monaco.languages.CompletionItemKind.Field,
				insertText: pkey,
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
				detail: detail,
				command: command
			});
		}

		let resources = [];

		if (obj.hasOwnProperty('resources')) {

			for (const [rkey, rvalue] of Object.entries(obj.resources)) {
				resources.push({'label': rkey, 'name': rvalue.name});
			}
			
			let regType = obj.hasOwnProperty('type') ? obj.type : '';
			let subresouces = this.getGetVirtualTableSubresouces(metadataSubtable, regType);
			let subExists = false;
			let items = [];

			for (let idx = 0; idx < resources.length; idx++) {					

				let resource = resources[idx];

				for (const [skey, svalue] of Object.entries(subresouces)) {
					subExists = true;
					items.push({'label': resource.label + skey, 'name': resource.name + ' ' + svalue});
				}

				if (!subExists)
					items.push(resource);					

			}

			for (let idx = 0; idx < items.length; idx++) {					

				let item = items[idx];

				suggestions.push({
					label: item.label,
					kind: monaco.languages.CompletionItemKind.value,
					insertText: item.label,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: item.name
				});

			}
		
		}		

	}

	/**
	 * Fills array of completion for metadata source in query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {string} sourceDefinition source string definition
	 */
	getQueryFieldsCompletionForMetadata(suggestions, sourceDefinition) {

		let metadataExists = false;

		let sourceArray = sourceDefinition.split('.');

		if (1 < sourceArray.length) {						
			
			metadataExists = true;

			let metadataType = sourceArray[0].toLowerCase();
			let metadataName = sourceArray[1].toLowerCase();
			let metadataSubtable = (2 < sourceArray.length) ? sourceArray[2].toLowerCase() : '';

			for (const [key, value] of Object.entries(bslMetadata)) {
				
				if (value.hasOwnProperty(this.queryNameField) && value[this.queryNameField].toLowerCase() == metadataType) {
				
					if (0 < Object.keys(value.items).length) {

						for (const [ikey, ivalue] of Object.entries(value.items)) {

							if (ikey.toLowerCase() == metadataName) {
								
								if (ivalue.hasOwnProperty('properties'))
									this.fillSuggestionsForMetadataItemInQuery(suggestions, ivalue, metadataSubtable);
								else
									requestMetadata(value.name.toLowerCase() + '.' + ikey.toLowerCase());

							}

						}

					}
					else {
						
						requestMetadata(value.name.toLowerCase());

					}

				}
				
			}
			
		}

		return metadataExists;

	}

	/**
	 * Fills array of completion for temporary table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {string} sourceDefinition source string definition
	 * @param {position} startPosition the begining of current query
	 */
	getQueryFieldsCompletionForTempTable(suggestions, sourceDefinition, startPosition) {

		let tableExists = false;

		// Let's find definition for temporary table
		let intoMatch = Finder.findPreviousMatch(this.model, '(?:поместить|into)\\s+' + sourceDefinition, startPosition);

		if (intoMatch) {
			
			// Now we need to find start of this query
			let position =  new monaco.Position(intoMatch.range.startLineNumber, intoMatch.range.startColumn);
			let startMatch = Finder.findPreviousMatch(this.model, '(?:выбрать|select)', position);

			if (startMatch) {
				
				// Searching field's definition between select...into
				let searchRange = new monaco.Range(startMatch.range.startLineNumber, 1, intoMatch.range.startLineNumber, 1);				
				let matches = Finder.findMatches(this.model, '^.*(?:как|as)\\s+([a-zA-Z0-9\u0410-\u044F_]*?),?$');
				matches = matches.concat(Finder.findMatches(this.model, '^\\s*[a-zA-Z0-9\u0410-\u044F_]*\\.([a-zA-Z0-9\u0410-\u044F_]*?)[,\\s]*$', searchRange));
				
				if (matches) {
					
					for (let idx = 0; idx < matches.length; idx++) {
						
						let match = matches[idx];
						let field = match.matches[match.matches.length - 1];
						
						if (field) {

							suggestions.push({
								label: field,
								kind: monaco.languages.CompletionItemKind.Enum,
								insertText: field,
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet						
							});

							tableExists = true;

						}

					}					

				}

			}

		}

		return tableExists;
		
	}

	/**
	 * Updates context refs for chain of fields like
	 * Номенклатура.НоменклатурнаяГруппа.Родитель.СпособУчетаНДС. <- there
	 * It's nessasary for autocomplete complex fields in existing query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {bool} allowChain allow or not call chain completion (to avoid looping)
	 */
	getQueryFieldsChainCompletion(suggestions) {

		let match = Finder.findMatches(this.model, '[a-zA-Z0-9\u0410-\u044F]+', new monaco.Range(this.lineNumber, 1, this.lineNumber, this.column));
		
		if (match.length) {

			let back_pos = this.position;
			let back_exp = this.lastRawExpression;

			let prev_suggestions = [];

			for (let i = 0; i < match.length; i++) {

				let field = match[i];
				let field_name = field.matches[0].toLowerCase();
				let field_range = field.range;

				this.position = new monaco.Position(this.lineNumber, field_range.endColumn + 1);
				
				if (i == 0) {
					this.lastRawExpression = field_name; 
					this.getQueryFieldsCompletion(prev_suggestions, false);					
				}
				else {
					
					let command = false;
					let suggest_idx = 0;

					while (suggest_idx < prev_suggestions.length && !command) {
						
						let suggestion = prev_suggestions[suggest_idx];
						
						if (suggestion.insertText.toLowerCase() == field_name && suggestion.command)
							command = suggestion.command;

						suggest_idx++;

					}					
					
					prev_suggestions = [];

					if (command && command.arguments.length) {
					
						let command_context = command.arguments[0];
					
						if (command_context.hasOwnProperty('data')) {							
					
							let lineContextData = contextData.get(this.position.lineNumber);
					
							if (!lineContextData) {
								contextData.set(this.position.lineNumber, new Map());
							}

							lineContextData = contextData.get(this.position.lineNumber);
							lineContextData.set(field_name, command_context.data);
							this.getRefCompletion(prev_suggestions);

						}

					}

				}

			}

			this.position = back_pos;
			this.lastRawExpression = back_exp;
			this.getRefCompletion(suggestions);

		}		

	}

	/**
	 * Fills array of completion for fields of querie's table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {bool} allowChain allow or not call chain completion (to avoid looping)
	 */
	getQueryFieldsCompletion(suggestions, allowChain = true) {

		if (this.getLastCharacter() == '.' && this.lastRawExpression) {
			
			// Let's find start of current query
			let startMatch = Finder.findPreviousMatch(this.model, '(?:выбрать|select)', this.position, false);
			
			if (startMatch) {
								
				// Now we need to find lastExpression definition
				let position =  new monaco.Position(startMatch.range.startLineNumber, startMatch.range.startColumn);

				// Temp table definition
				let sourceDefinition = '';
				let match = Finder.findNextMatch(this.model, '^[\\s\\t]*([a-zA-Z0-9\u0410-\u044F_]+)\\s+(?:как|as)\\s+' + this.lastRawExpression + '[\\s,\\n]*$', position);

				if (match) {

					sourceDefinition = match.matches[1];
					this.getQueryFieldsCompletionForTempTable(suggestions, sourceDefinition, position);

				}
				else {
					
					// Metadata table definition
					match = Finder.findNextMatch(this.model, '(?:из|from)[\\s\\S\\n]*?(?:как|as)\\s+' +  this.lastRawExpression + '[\\s,\\n]*$' , position);
											
					if (match) {					
											
						// Searching the source
						position =  new monaco.Position(match.range.endLineNumber, match.range.endColumn);
						match = Finder.findPreviousMatch(this.model, '[a-zA-Z0-9\u0410-\u044F]+\\.[a-zA-Z0-9\u0410-\u044F_]+(?:\\.[a-zA-Z0-9\u0410-\u044F]+)?', position);
				
						if (match) {									
							sourceDefinition = match.matches[0];
							this.getQueryFieldsCompletionForMetadata(suggestions, sourceDefinition);																			
						}

					}

				}

				if (!suggestions.length && allowChain)
					this.getQueryFieldsChainCompletion(suggestions);

			}
			
		}

	}

	/**
	 * Returns virtual tables of register depending on the register's type
	 * 
	 * @param {string} type of register like balance, turnovers, periodical
	 *	 
	 * @returns {array} array of names
	 */
	getRegisterVirtualTables(type) {

		let tables = {};

		if (engLang) {

			if (type == 'periodical') {
				tables = {				
					"SliceLast": "SliceLast",
					"SliceFirst": "SliceFirst"
				};
			}
			else if (type == 'balance') {
				tables = {					
					"Turnovers": "Turnovers",
					"Balance": "Balance",
					"BalanceAndTurnovers": "BalanceAndTurnovers"
				};
			}
			else if (type == 'turnovers') {
				tables = {					
					"Turnovers": "Turnovers"					
				};
			}
			else if (type == 'accounting') {
				tables = {					
					"RecordsWithExtDimensions": "RecordsWithExtDimensions",
					"Turnovers": "Turnovers",
					"DrCrTurnovers": "DrCrTurnovers",
					"Balance": "Balance",
					"BalanceAndTurnovers": "BalanceAndTurnovers",
					"ExtDimensions": "ExtDimensions"
				};
			}
			else if (type == 'action_period') {
				tables = {					
					"Base": "Base",
					"ScheduleData": "ScheduleData",
					"ActualActionPeriod": "ActualActionPeriod"					
				};
			}
			else if (type == 'noaction_period') {
				tables = {					
					"Base": "Base"					
				};
			}

		}
		else {

			if (type == 'periodical') {
				tables = {					
					"СрезПоследних": "СрезПоследних",
					"СрезПервых": "СрезПервых"
				};
			}
			else if (type == 'balance') {
				tables = {					
					"Обороты": "Обороты",
					"Остатки": "Остатки",
					"ОстаткиИОбороты": "ОстаткиИОбороты"
				};
			}
			else if (type == 'turnovers') {
				tables = {					
					"Обороты": "Обороты"
				};
			}
			else if (type == 'accounting') {
				tables = {					
					"ДвиженияССубконто": "ДвиженияССубконто",
					"Обороты": "Обороты",
					"ОборотыДт": "ОборотыДт",
					"Остатки": "Остатки",
					"ОстаткиИОбороты": "ОстаткиИОбороты",
					"Субконто": "Субконто"
				};
			}
			else if (type == 'action_period') {
				tables = {					
					"БазаНачисления": "БазаНачисления",
					"ДанныеГрафика": "ДанныеГрафика",
					"ФактическийПериодДействия": "ФактическийПериодДействия"					
				};
			}
			else if (type == 'noaction_period') {
				tables = {					
					"БазаНачисления": "БазаНачисления"					
				};
			}

		}

		return tables;

	}

	/**
	 * Fills array of completion for virtual tables of registers in source
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} metadataItem name of metadata item like (ЦеныНоменклатуры/ProductPrices, СвободныеОстатки/AvailableStock)
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 	 
	 */
	getQuerySourceMetadataRegTempraryTablesCompletion(data, metadataItem, suggestions) {

		for (const [ikey, ivalue] of Object.entries(data.items)) {

			if (ikey.toLowerCase() == metadataItem.toLowerCase() && ivalue.hasOwnProperty('type')) {

				let tables = this.getRegisterVirtualTables(ivalue.type);

				for (const [tkey, tvalue] of Object.entries(tables)) {

					suggestions.push({
						label: tkey,
						kind:  monaco.languages.CompletionItemKind.Unit,
						insertText: tvalue,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
					});

				}				

			}

		}

	}

	/**
	 * Fills array of completion for external data as source
	 * 
	 * @param {object} externalData object with external data
	 * @param {string} sourceName name of source
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQuerySourceForExternalData(externalData, sourceName, suggestions, kind) {

		if (!sourceName) {
			let label = externalData[this.queryNameField + '_tables'];
			suggestions.push({
				label: label,
				kind: kind,
				insertText: label,
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
				command: { id: 'vs.editor.ICodeEditor:1:requestMetadata', arguments: [{ "metadata": externalData.name.toLowerCase() + '.' + label.toLowerCase() }] }
			});
		}

	}

	/**
	 * Fills array of completion for source of table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQuerySourceMetadataCompletion(metadataName, metadataItem, metadataFunc, suggestions, kind, maxLevel) {
	
		let sourceExist = false;

		for (const [key, value] of Object.entries(bslMetadata)) {

			if (value.hasOwnProperty(this.queryNameField) && value[this.queryNameField].toLowerCase() == metadataName.toLowerCase()) {

				sourceExist = true;

				if (!metadataItem) {

					if (Object.keys(value.items).length != 0) {

						for (const [ikey, ivalue] of Object.entries(value.items)) {

							let label = ikey;

							suggestions.push({
								label: ikey,
								kind: kind,
								insertText: label,
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								command: { id: 'vs.editor.ICodeEditor:1:requestMetadata', arguments: [{ "metadata": value.name.toLowerCase() + '.' + label.toLowerCase()}] }
							});

						}

					}
					else {
						requestMetadata(value.name.toLowerCase());
					}

				}
				else if (key == 'externalDataSources') {
					this.getQuerySourceForExternalData(value, metadataFunc, suggestions, kind);
				}
				else if (!metadataFunc && 2 < maxLevel) {
					this.getQuerySourceMetadataRegTempraryTablesCompletion(value, metadataItem, suggestions)

				}

			}

		}

		return sourceExist;

	}

	/**
	 * Fills array of completion for temporary tables in source
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 	 
	 */
	getQuerySourceTempraryTablesCompletion(suggestions) {

		let sourceExist = false;
		let startMatch = Finder.findPreviousMatch(this.model, '(?:выбрать|select)', this.position);

		if (startMatch) {

			let matches = Finder.findMatches(this.model, '(?:поместить|into)\\s+([a-zA-Z0-9\u0410-\u044F_]+)');

			if (matches) {
				
				for (let idx = 0; idx < matches.length; idx++) {
				
					let match = matches[idx];

					if (match.range.startLineNumber < startMatch.range.startLineNumber) {

						let tableName = match.matches[match.matches.length - 1];
							
						suggestions.push({
							label: tableName,
							kind: monaco.languages.CompletionItemKind.Unit,
							insertText: tableName,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet						
						});

						sourceExist = true;
						
					}

				}

			}

		}

		return sourceExist;

	}

	getQueryMetadataSources(suggestions, kind) {

		let sourceExist = false;

		for (const [key, value] of Object.entries(bslMetadata)) {

			if (value.hasOwnProperty(this.queryNameField)) {

				let source = value[this.queryNameField];

				suggestions.push({
					label: source,
					kind: kind,
					insertText: source,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
				});

				sourceExist = true;
				
			}

		}

		return sourceExist;

	}

	/**
	 * Fills array of completion for source of table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQuerySourceCompletion(suggestions, kind) {

		let sourceExist = false;

		let fromTriggers = ['из', 'соединение', 'from', 'join'];
		let lastWord = this.getLastSeparatedWord()
		
		if (lastWord) {
			
			if (fromTriggers.indexOf(lastWord.toLowerCase()) == -1) {
				
				let char = this.getLastCharInLine(this.lineNumber - 1);
				
				if (char == ',') {
				
					let fromMatch = Finder.findPreviousMatch(this.model, '(?:из|from)', this.position);
				
					if (fromMatch && fromMatch.range.startLineNumber < this.lineNumber) {					
						let ignore_keywords = ['как', 'as', 'по', 'on'];
						lastWord = this.getLastWordWithTokenInRange('keyword', fromMatch.range.startLineNumber, 1, this.lineNumber, this.column - 1, ignore_keywords);
					}
				}

			}
			
			if (0 <= fromTriggers.indexOf(lastWord.toLowerCase())) {

				let pattern = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?$/;
				let unclosed = this.unclosedString(this.textBeforePosition);						
				let regex = pattern.exec(unclosed.string ? unclosed.string.slice(1) : this.lastExpression);			
				
				let metadataName = regex && 1 < regex.length ? regex[1] : '';
				let metadataItem = regex && 2 < regex.length ? regex[2] : '';
				let metadataFunc = regex && 3 < regex.length ? regex[3] : '';
				
				sourceExist = this.getQuerySourceMetadataCompletion(metadataName, metadataItem, metadataFunc, suggestions, kind, 3);

				if (!sourceExist) {
				
					// suggestion for metadata sources like (catalog, document, etc.)
					sourceExist = this.getQueryMetadataSources(suggestions, kind);
					// suggestion for temporary tables
					sourceExist = Math.max(sourceExist, this.getQuerySourceTempraryTablesCompletion(suggestions));
				
				}
												
			}			

		}

		return sourceExist;

	}

	/**
	 * Fills array of completion for tables in the current query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryTablesCompletion(suggestions, kind) {
		
		if (this.getLastCharacter() != '.' && this.getLastCharacter() != '(' && this.lastExpression.indexOf('&') < 0) {

			// Let's find start of current query
			let startMatch = Finder.findPreviousMatch(this.model, '(?:выбрать|select)', this.position);

			if (startMatch) {

				let template = '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|имеющие|где|индексировать|havin|where|index|group|union|order|;)'
				let position = new monaco.Position(startMatch.range.startLineNumber, startMatch.range.startColumn);
				let fromMatch = Finder.findNextMatch(this.model, template, position);

				if (!fromMatch) {
					template = '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*$';
					fromMatch = Finder.findNextMatch(this.model, template, position);
				}

				if (fromMatch && fromMatch.range.startLineNumber < startMatch.range.startLineNumber) {								
					// This is loops to the beginning. Trying another template
					fromMatch = Finder.findNextMatch(this.model, '(?:из|from)\\s+(?:(?:.|\\n|\\r)+)$', position);
				}

				if (fromMatch) {
					
					// Now we need to find tables definitions
					let range = new monaco.Range(fromMatch.range.startLineNumber, 1, fromMatch.range.endLineNumber, fromMatch.range.endColumn);
					let matches = Finder.findMatches(this.model, '\\s+(?:как|as)\\s+([a-zA-Z0-9\u0410-\u044F_]+)', range);
					
					for (let idx = 0; idx < matches.length; idx++) {

						let match = matches[idx];
						let tableName = match.matches[match.matches.length - 1];
											
						suggestions.push({
							label: tableName,
							kind: kind,
							insertText: tableName,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
						});					
		
					}

				}

			}

		}

	}

	/**
	 * Fills array of completion for refs constructor (ССЫЛКА|REFS)
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryRefCompletion(suggestions, kind) {

		let pattern = /(.+?)(?:\.(.*?))?$/;
		let unclosed = this.unclosedString(this.textBeforePosition);						
		let lastExpression = this.lastExpression;
		lastExpression = lastExpression.replace(/(ссылка|refs)/gi, '');
		let regex = pattern.exec(unclosed.string ? unclosed.string.slice(1) : lastExpression);			
				
		let metadataName = regex && 1 < regex.length ? regex[1] : '';
		let metadataItem = regex && 2 < regex.length ? regex[2] : '';

		if (!metadataItem && this.getLastCharacter() != '.')
			this.getQueryMetadataSources(suggestions, kind);
		else
			this.getQuerySourceMetadataCompletion(metadataName, metadataItem, '', suggestions, kind, 2);		

	}

	/**
	 * Returns completion array from customSuggestions
	 * 
	 * @param {bool} erase on not customSuggestions
	 * 
	 * @returns {array} array of completion
	 */
	getCustomSuggestions(erase) {

		let suggestions = [];
		
		if (customSuggestions.length) {
			
			suggestions = customSuggestions.slice();
			editor.previousCustomSuggestions = [...suggestions];
			
			if (erase)
				customSuggestions = [];

			if (editor.showSnippetsOnCustomSuggestions) {
				
				let snippents_collection = snippets;
				
				if (isQueryMode())
					snippents_collection = querySnippets;

				if (isDCSMode())
					snippents_collection = DCSSnippets;

				this.getSnippets(suggestions, snippents_collection, true);

			}

		}

		return suggestions;

	}

	/**
	 * Completion provider for query language	
	 * 
	 * @returns {array} array of completion
	 */
	getQueryCompletion() {

		let suggestions = this.getCustomSuggestions(true);		
		
		if (!suggestions.length && !editor.disableNativeSuggestions) {
		
			if (!this.requireQueryValue()) {

				if (!this.requireQueryRef()) {

					if (!this.getQuerySourceCompletion(suggestions, monaco.languages.CompletionItemKind.Enum)) {

						if (this.lastOperator != '"') {
							let functions = this.getQueryFunctions(bslQuery);
							this.getCommonCompletion(suggestions, functions, monaco.languages.CompletionItemKind.Function, true);
							this.getRefCompletion(suggestions);
							this.getQueryTablesCompletion(suggestions, monaco.languages.CompletionItemKind.Class);
							this.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
						}

						this.getQueryCommonCompletion(suggestions, monaco.languages.CompletionItemKind.Module);
						this.getQueryParamsCompletion(suggestions, monaco.languages.CompletionItemKind.Enum);				
						this.getQueryFieldsCompletion(suggestions);
						this.getSnippets(suggestions, querySnippets, false);

					}

				}
				else {
					
					this.getQueryRefCompletion(suggestions, monaco.languages.CompletionItemKind.Enum);

				}

			}
			else {
				
				this.getQueryValuesCompletion(suggestions, bslQuery.values, monaco.languages.CompletionItemKind.Enum);

			}
		}

		if (suggestions.length)
			return { suggestions: suggestions }
		else
			return [];

	}

	/**
	 * Completion provider for DCS language	 
	 * 
	 * @returns {array} array of completion
	 */
	 getDCSCompletion() {

		let suggestions = this.getCustomSuggestions(true);
		
		if (!suggestions.length && !editor.disableNativeSuggestions) {

			if (!this.requireQueryValue()) {

				if (this.lastOperator != '"') {
					this.getFillSuggestionsFromArray(suggestions, languages.bsl.languageDef.rules.DCSExp, monaco.languages.CompletionItemKind.Module, false);
					this.getFillSuggestionsFromArray(suggestions, languages.dcs.languageDef.rules.characteristics, monaco.languages.CompletionItemKind.Module, false);
					let functions = this.getQueryFunctions(bslDCS);
					this.getCommonCompletion(suggestions, functions, monaco.languages.CompletionItemKind.Function, true);
					this.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
					this.getRefCompletion(suggestions);
					this.getSnippets(suggestions, DCSSnippets, false);
					this.getCommonModulesCompletion(suggestions);
				}

			}
			else {
				
				this.getQueryValuesCompletion(suggestions, bslQuery.values, monaco.languages.CompletionItemKind.Enum);

			}
		}

		if (suggestions.length)
			return { suggestions: suggestions }
		else
			return [];

	}

	/**
	 * Returns array of parametrs as described in JSON-dictionary
	 * for current node (method)
	 *  
	 * @param {object} method - node from BSL-JSON dictionary
	 * 
	 * @returns {array} array of method`s parameters
	 */
	getMethodsSignature(method) {

		let signatures = [];

		if (method.hasOwnProperty('signature')) {

			for (const [skey, svalue] of Object.entries(method.signature)) {

				if (svalue.hasOwnProperty('СтрокаПараметров') && svalue.hasOwnProperty('Параметры')) {

					let sig_label = svalue.СтрокаПараметров;
					let clear_label = this.getClearSignatureLabel(sig_label);
					let sig_params = clear_label.split(',');

					let signature = {
						label: sig_label,
						parameters: []
					}

					let param_index = 0;

					for (const [pkey, pvalue] of Object.entries(svalue.Параметры)) {
						let param_label = (param_index < sig_params.length) ? sig_params[param_index].trim() : pkey;						
						signature.parameters.push({
							label: param_label,
							documentation: pvalue
						});
						param_index++;
					}

					signatures.push(signature);

				}

			}

		}

		return signatures;

	}

	/**
	 * Returns array of signatures as described in JSON-dictionary
	 * for current node (class)
	 *  
	 * @param {object} elem - node from BSL-JSON dictionary
	 * 
	 * @returns {array} array of signatures
	 */
	getConstructSignature(elem) {

		let signatures = [];

		if (elem.hasOwnProperty('constructors')) {

			for (const [ckey, cvalue] of Object.entries(elem.constructors)) {

				if (cvalue.hasOwnProperty('signature')) {

					let sig_label = cvalue.signature;
					let clear_label = this.getClearSignatureLabel(sig_label);
					let sig_params = clear_label.split(',');

					let signature = {
						label: sig_label,
						documentation: cvalue.hasOwnProperty('description') ? cvalue.description : '',
						parameters: []
					}

					if (cvalue.hasOwnProperty('params')) {

						let param_index = 0;

						for (const [pkey, pvalue] of Object.entries(cvalue.params)) {
							let param_label = (param_index < sig_params.length) ? sig_params[param_index].trim() : pkey;
							signature.parameters.push({
								label: param_label,
								documentation: pvalue
							});
							param_index++;
						}

					}

					signatures.push(signature);

				}

			}

		}

		return signatures;

	}

	/**
	 * Return an index of the active parameter
	 * 
	 * @returns {int} index
	 */
	getSignatureActiveParameter() {

		let unclosed_string = this.unclosedString(this.textBeforePosition).string;
		let is_query = (isQueryMode() || isDCSMode());
		
		if (!is_query && this.isItStringLiteral()) {

			while (unclosed_string && unclosed_string.slice(-1) != '"')
				unclosed_string = unclosed_string.substr(0, unclosed_string.length - 1);

		}

		unclosed_string = unclosed_string.replace(/\(.*?\)/gi, '');
		unclosed_string = unclosed_string.replace(/\".*?\"/gi, '');

		return unclosed_string.split(',').length - 1;
		
	}

	/**
	 * Finds signatures provided for current class
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * 
	 * @returns {SignatureHelp} helper with signatures
	 */
	getClassSigHelp(data) {

		let helper = null;

		let regex = /(.+?)(?:\.(.*))?$/.exec(this.lastExpression);
		let className = regex && 1 < regex.length ? regex[1] : '';
		let methodName = regex && 2 < regex.length ? regex[2] : '';

		if (className) {

			for (const [key, value] of Object.entries(data)) {

				if (value[this.nameField].toLowerCase() == className) {

					let signatures = [];

					if (methodName && value.hasOwnProperty('methods')) {

						for (const [mkey, mvalue] of Object.entries(value.methods)) {

							if (mvalue[this.nameField].toLowerCase() == methodName) {
								signatures = signatures.concat(this.getMethodsSignature(mvalue));
							}

						}

					}

					signatures = signatures.concat(this.getConstructSignature(value));

					if (signatures.length) {
						helper = {
							activeParameter: this.getSignatureActiveParameter(),
							activeSignature: 0,
							signatures: signatures,
						}
					}

				}

			}

		}

		return helper;

	}

	/**
	 * Finds signatures provided for metadata subitem`s methods
	 * like Write, Unlock
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * 
	 * @returns {SignatureHelp} helper with signatures
	 */
	getMetadataItemSigHelp(data) {

		let helper = null;

		let exp = this.getLastNExpression(4);

		if (exp) {

			let fullText = this.getFullTextBeforePosition();
			let regex = null;
			try {
				regex = new RegExp(exp + '\\s*=\\s*(.*)\\(.*\\);', 'gi');
			}
			catch {
				return helper;
			}

			regex = regex.exec(fullText);

			if (regex && 1 < regex.length) {

				regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(regex[1]);

				let metadataName = regex && 1 < regex.length ? regex[1] : '';
				let metadataItem = regex && 2 < regex.length ? regex[2] : '';
				let metadataFunc = regex && 3 < regex.length ? regex[3] : '';

				if (metadataName && metadataItem && metadataFunc) {

					metadataFunc = this.lastRawExpression;

					if (metadataFunc) {

						for (const [key, value] of Object.entries(data)) {

							if (value.hasOwnProperty(this.nameField)) {

								if (value[this.nameField].toLowerCase() == metadataName) {

									for (const [ikey, ivalue] of Object.entries(value.items)) {

										if (ikey.toLowerCase() == metadataItem) {

											if (value.hasOwnProperty('objMethods')) {

												for (const [mkey, mvalue] of Object.entries(value.objMethods)) {

													if (mvalue[this.nameField].toLowerCase() == metadataFunc) {

														let signatures = this.getMethodsSignature(mvalue);
														if (signatures.length) {
															helper = {
																activeParameter: this.getSignatureActiveParameter(),
																activeSignature: 0,
																signatures: signatures,
															}
														}

													}

												}

											}

										}

									}

								}
							}

						}

					}

				}

			}

		}

		return helper;

	}

	/**
	 * Finds signatures provided for metadata item methods
	 * like FindByCode, CreateRecordManager by method type
	 * like 'method', 'manager'
	 * 
	 * @param {object} object metadata object from BSL-JSON dictionary
	 * @param {string} typeOfMethods type of method
	 * @param {object} methodName method name for filtering
	 * 
	 * @returns {SignatureHelp} helper with signatures
	 */
	getMetadataSigHelpByMethodType(object, typeOfMethods, methodName) {

		let helper = null;

		if (object.hasOwnProperty(typeOfMethods)) {

			for (const [mkey, mvalue] of Object.entries(object[typeOfMethods])) {

				if (mvalue[this.nameField].toLowerCase() == methodName) {
					let signatures = this.getMethodsSignature(mvalue);
					if (signatures.length) {
						helper = {
							activeParameter: this.getSignatureActiveParameter(),
							activeSignature: 0,
							signatures: signatures,
						}
					}
				}

			}

		}

		return helper;

	}

	/**
	 * Finds signatures provided for metadata item`s methods
	 * like FindByCode, CreateRecordManager
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * 
	 * @returns {SignatureHelp} helper with signatures
	 */
	getMetadataSigHelp(data) {

		let helper = null;

		let regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(this.lastExpression);
		let metadataName = regex && 1 < regex.length ? regex[1] : '';
		let metadataItem = regex && 2 < regex.length ? regex[2] : '';
		let metadataFunc = regex && 3 < regex.length ? regex[3] : '';

		if (metadataFunc) {

			for (const [key, value] of Object.entries(data)) {

				if (value.hasOwnProperty(this.nameField)) {

					if (value[this.nameField].toLowerCase() == metadataName) {
						
						helper = this.getMetadataSigHelpByMethodType(value, 'methods', metadataFunc);

						if (!helper && value.hasOwnProperty('items')) {
						
							for (const [ikey, ivalue] of Object.entries(value.items)) {

								if (ikey.toLowerCase() == metadataItem)
									helper = this.getMetadataSigHelpByMethodType(ivalue, 'manager', metadataFunc);

							}
							
						}

					}

				}

			}

		}
		else {
			helper = this.getMetadataItemSigHelp(data);
		}

		return helper;

	}

	/**
	 * Finds signatures provided for global functions	 
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * 
	 * @returns {SignatureHelp} helper with signatures
	 */
	getCommonSigHelp(data) {

		let helper = null;

		let funcName = this.getFuncName();

		if (funcName) {

			for (const [key, value] of Object.entries(data)) {

				if (value[this.nameField].toLowerCase() == funcName) {

					let signatures = this.getMethodsSignature(value);

					if (signatures.length) {
						helper = {
							activeParameter: this.getSignatureActiveParameter(),
							activeSignature: 0,
							signatures: signatures,
						}
					}

				}

			}

		}

		return helper;

	}

	/**
	 * Fills array of completion for snippets	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {bool} customSuggestions is it called from custom suggestions or not
	 */
	getSnippets(suggestions, data, customSuggestions) {

		if (this.word || customSuggestions) {

			for (const [key, value] of Object.entries(data)) {

				if (key.toLowerCase().startsWith(this.word) || value.prefix.toLowerCase().startsWith(this.word) || customSuggestions) {

					suggestions.push({
						label: value.prefix,
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: value.body,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						detail: key,
						documentation: { "value": this.prepareSnippetDocumentation(value.body) }
					});

				}

			}

		}

	}

	/**
	 * Fills signatures provided from custom signatures	 
	 * 
	 * @param {SignatureHelpContext} context signature help context
	 * 
	 * @return {SignatureHelp} helper with signatures
	 */
	getCustomSigHelp(context) {

		let helper = null;

		let word = this.getWordUntilOpenBracket();
		
		if (word) {
			
			for (const [key, value] of Object.entries(customSignatures)) {			
		
				if (key.toLowerCase() == word && value) {

					helper = {
						activeParameter: this.getSignatureActiveParameter(),
						activeSignature: 0,
						signatures: value,
					}						
							
				}
	
			}
			
		}

		return helper;

	}

	/**
	 * Fills signatures provided for reference-type object
	 * if a reference was found in the previous position
	 * 
	 * @return {SignatureHelp} helper with signatures
	 */
	getRefSigHelp() {
		
		let helper = null;

		let match = Finder.findPreviousMatch(this.model, '\\(', this.position);
		
		if (match) {

			const position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = this.lineNumber) {

				let lineContextData = contextData.get(position.lineNumber)
				let wordContext = null;

				if (lineContextData) {
					
					let wordUntil = this.model.getWordUntilPosition(position);
					wordContext = lineContextData.get(wordUntil.word.toLowerCase());
				
					if (wordContext && wordContext.sig) {
												
						helper = {
							activeParameter: this.getSignatureActiveParameter(),
							activeSignature: 0,
							signatures: wordContext.sig,
						}						

					}
				}

			}

		}	
		
		return helper;
	}

	/**
	 * Signature help provider
	 * 
	 * @param {SignatureHelpContext} context signature help context
	 * 
	 * @returns {object} helper
	 */
	getSigHelp(context) {
		
		let unclosed = this.unclosedString(this.textBeforePosition);
		
		if (this.lastOperator != ')' && 0 <= unclosed.index) {

			let helper = this.getCustomSigHelp(context);

			if (!editor.disableNativeSignatures) {

				if (!helper)
					helper = this.getRefSigHelp();

				if (!helper)
					helper = this.getMetadataSigHelp(bslMetadata);

				if (!helper)
					helper = this.getClassSigHelp(bslGlobals.classes);

				if (!helper)
					helper = this.getCommonSigHelp(bslGlobals.globalfunctions);

				if (!helper)
					helper = this.getCommonSigHelp(bslGlobals.customFunctions);

			}

			if (helper) {
				
				if (context && context.activeSignatureHelp)
					helper.activeSignature = context.activeSignatureHelp.activeSignature;

				return new SignatureHelpResult(helper);

			}

		}

	}

	/**
	 * Signature help provider for query language
	 * 
	 * @param {SignatureHelpContext} context signature help context
	 * 
	 * @returns {object} helper
	 */
	getQuerySigHelp(context) {
		
		let unclosed = this.unclosedString(this.textBeforePosition);

		if (this.lastOperator != ')' && !this.requireQueryValue() && 0 <= unclosed.index) {
			
			let helper = this.getCustomSigHelp(context);

			if (!helper && !editor.disableNativeSignatures) {
				let functions = this.getQueryFunctions(bslQuery);
				helper = this.getCommonSigHelp(functions);
			}
			
			if (helper)
				return new SignatureHelpResult(helper);

		}

	}

	/**
 	 * Signature help provider for query language
 	 * 
	 * @param {SignatureHelpContext} context signature help context
	 * 
 	 * @returns {object} helper
 	 */
	getDCSSigHelp(context) {

		let unclosed = this.unclosedString(this.textBeforePosition);

		if (this.lastOperator != ')' && 0 <= unclosed.index) {

			let helper = this.getCustomSigHelp(context);

			if (!helper && !editor.disableNativeSignatures) {

				let functions = this.getQueryFunctions(bslDCS);
				helper = this.getCommonSigHelp(functions);

				if (!helper) {
					functions = this.getQueryFunctions(bslQuery);
					helper = this.getCommonSigHelp(functions);
				}

			}

			if (helper)
				return new SignatureHelpResult(helper);

		}

	}

	/**
	 * Code lens provider
	 * @param {ITextModel} model current model
	 * @param {CancellationToken} token 
	 * 
	 * @returns {array} lenses
	 */	
	static provideCodeLenses(model, token) {

		let lenses = [];

		customCodeLenses.forEach(function (value) {
			lenses.push({
				range: {
					startLineNumber: value.lineNumber,
					startColumn: value.column,
					endLineNumber: value.lineNumber,
					endColumn: value.column + value.text.length
				},
				command: {
					title: value.text
				}
			});
		});
		
		return {
			lenses: lenses,
			dispose: () => {}
		};

	}

	/**
	 * Updates bslMetadata from JSON-string which
	 * was received from 1C
	 * 
	 * @param {string} metadata JSON-string with metadata info
	 * 
	 * @returns {true|object} true - metadata was updated, {errorDescription} - not
	 */
	updateMetadata(metadata, path) {

		try {
			
			let metadataObj = JSON.parse(metadata);

			if (path) {

				if (bslHelper.objectHasPropertiesFromArray(bslMetadata, path.split('.'))) {
					bslHelper.setObjectProperty(bslMetadata, path, metadataObj);
					return true;
				}
				else {
					throw new TypeError("Wrong path");
				}

			}
			else {

				if (metadataObj.hasOwnProperty('catalogs') || metadataObj.hasOwnProperty('customObjects')) {
					for (const [key, value] of Object.entries(metadataObj)) {
						bslMetadata[key].items = value;
					}
					return true;
				}
				else {
					throw new TypeError("Wrong structure of metadata");
				}

			}

		}
		catch (e) {
			return { errorDescription: e.message };
		}


	}

	/**
	 * Returns a function description from comment above
	 *
	 * @param {ITextModel} text model of module
	 * @param {int} line of function definition
	 *
	 * @returns {string} the function description
	 */
	static parseFunctionDescription(model, funcLineNumber) {

		let short_description = '';
		let full_description = '';
		let line_number = funcLineNumber - 1;

		while (0 < line_number && model.getValueInRange(new monaco.Range(line_number, 1, line_number, 3)) == '//') {
			line_number--;
		}

		line_number++;

		const matches = Finder.findMatches(model, 'параметры:', new monaco.Range(line_number, 1, funcLineNumber, 1));

		if (matches && matches.length) {
			let range = new monaco.Range(line_number, 1, matches[0].range.startLineNumber, matches[0].range.startColumn);
			short_description = model.getValueInRange(range);
		}
		else
			short_description = model.getValueInRange(new monaco.Range(line_number, 1, funcLineNumber, 1));

		full_description = model.getValueInRange(new monaco.Range(line_number, 1, funcLineNumber, 1))

		short_description = short_description.replace(/\/\//g, '').trim();
		full_description = full_description.replace(/\/\//g, '').trim();

		return {
			short: short_description,
			full: full_description,
		}

	}

	/**
	 * Returns params description from comment above
	 *
	 * @param {ITextModel} text model of module
	 * @param {string} parametersStr string with parameters
	 * @param {int} funcLineNumber line of function definition
	 *
	 * @returns {object} parameters
	 */
	 static parseFunctionParameters(model, parametersStr, funcLineNumber) {

		let sig_params = {};
			
		if (parametersStr) {
					
			let line_number = funcLineNumber - 1;
			let paramsExist = false;

			while (0 < line_number && !paramsExist && model.getValueInRange(new monaco.Range(line_number, 1, line_number, 3)) == '//') {
				line_number--;
				paramsExist = (model.getValueInRange(new monaco.Range(line_number, 1, line_number, 3)) == '// Параметры:');
			}

			line_number++;

			let params = parametersStr.split(',');
			
			params.forEach(function (param) {
				
				let param_full_name = param.split('=')[0].trim();
				let param_name = param_full_name.replace(/знач\s+/gi, '');
				let pattern = '\/\/ параметры:[\\s\\SS\\n\\t]*?' + param_name + '([\\s\\SS\\n\\t]*?)(?:\/\/\\s{1,4}[a-zA-Z0-9\u0410-\u044F_])';
				let range = new monaco.Range(line_number, 1, funcLineNumber, 1);
				let match = Finder.findMatches(model, pattern, range);
				let param_description = '';

				if (match && match.length) {
					param_description = match[0].matches[1];
					param_description = param_description.replace(/^\/\/*/gm, '');
					param_description = param_description.replace(/^\s*-\s*/gm, '');
					param_description = param_description.replace(/^\s*/gm, '');
				}

				sig_params[param_full_name] = param_description;
				
			});

		}
		
		return sig_params;

	}

	/**
	 * Parsing a module text
	 * 	 
	 * @param {string} moduleText text of module	 
	 * 
	 * @returns {object} structure of module
	 */
	static parseModule(moduleText) {

		let count_matches = 0;
		let module = {};

		const model = monaco.editor.createModel(moduleText);
		const pattern = '(?:процедура|функция|procedure|function)\\s+([a-zA-Z0-9\u0410-\u044F_]+)\\(([a-zA-Z0-9\u0410-\u044F_,\\s\\n="]*)\\)\\s+(?:экспорт|export)';
		const matches = Finder.findMatches(model, pattern);

		if (matches && matches.length) {

			count_matches = matches.length;

			for (let idx = 0; idx < matches.length; idx++) {

				let match = matches[idx];
				let method_name = match.matches[1];
				let params_str = match.matches[2];
				const description = this.parseFunctionDescription(model, match.range.startLineNumber)
				let sig_params = this.parseFunctionParameters(model, params_str, match.range.startLineNumber);
				
				let method = {
					name: method_name,
					name_en: method_name,
					description: description.full,
					detail: description.short,
					returns: '',
				}

				if (Object.keys(sig_params).length) {
					method['signature'] = {
						default: {
							СтрокаПараметров: "(" + params_str + ")",
							Параметры: sig_params
						}
					}
				}

				module[method_name] = method;

			}

		}

		return {
			module: module,
			count: count_matches
		};

	}

	/**
	 * Parsing a module text and building bslMetadata structure
	 * for common modules
	 * 
	 * @param {string} a name of common module
	 * @param {string} a text of module
	 * @param {bool} is modal global or not
	 * 
	 * @returns {int} count of matches (export functions)
	 */
	static parseCommonModule(moduleName, moduleText, isGlobal) {

		let parse = this.parseModule(moduleText);

		if (parse.count) {

			if (isGlobal) {
				for (const [key, value] of Object.entries(parse.module)) {
					bslGlobals.globalfunctions[key] = value;
				}
			}
			else
				bslMetadata.commonModules.items[moduleName] = parse.module;

		}

		return parse.count;

	}

	/**
	 * Parsing a module text and building bslMetadata structure
	 * for module of manager/object
	 * 	 
	 * @param {string} moduleText text of module
	 * @param {string} path path to metadata-property
	 * 
	 * @returns {int} count of matches (export functions)
	 */
	static parseMetadataModule(moduleText, path) {
		
		let parse = this.parseModule(moduleText);
		let count = parse.count;		

		if (count) {
			
			let path_array = path.split('.');
			path_array.pop();
			
			if (bslHelper.objectHasPropertiesFromArray(bslMetadata, path_array))
				bslHelper.setObjectProperty(bslMetadata, path.split('.'), parse.module);
			else
				count = 0;

		}

		return count;

	}

	/**
	 * Escapes special character in json-string
	 * before parsing
	 * 
	 * @param {string} jsonString string to parsing
	 * 
	 * @returns {string} escaped string
	 */
	static escapeJSON(jsonString) {

		return jsonString.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
	
	}

	/**
	 * Updates snippets from JSON-string which
	 * was received from 1C
	 * 
	 * @param {string} data JSON-string with snippets info
	 * @param {boolean} replace whether or not to replace native snippents
	 * 
	 * @returns {true|object} true - snippets was updated, {errorDescription} - not
	 */
	static updateSnippets(data, replace) {

		try {			
			let snippetsObj = JSON.parse(this.escapeJSON(data));
			if (snippetsObj.hasOwnProperty('snippets')) {
				if (replace) {
					snippets = snippetsObj.snippets;
				}
				else {
					for (const [key, value] of Object.entries(snippetsObj.snippets)) {
						snippets[key] = value;
					}
				}
				return true;
			}
			else {
				throw new TypeError("Wrong structure of snippets");
			}

		}
		catch (e) {
			return { errorDescription: e.message };
		}


	}

	/**
	 * Updates custom functions JSON-string which
	 * was received from 1C
	 * 
	 * @param {string} snips JSON-string with function's definition	 
	 * 
	 * @returns {true|object} true - functions was updated, {errorDescription} - not
	 */
	static updateCustomFunctions(data) {

		try {			
			let funcObj = JSON.parse(data);
			if (funcObj.hasOwnProperty('customFunctions')) {
				bslGlobals.customFunctions = funcObj.customFunctions;
				return true;
			}
			else {
				throw new TypeError("Wrong structure of custom functions");
			}

		}
		catch (e) {
			return { errorDescription: e.message };
		}


	}

	/**
	 * Finds blocks like conditions (if...endif) and loops (while...enddo)
	 * when start column startString equal start column endString
	 * 
	 * @param {ITextModel} current model of editor
	 * @param {string} regexp to detect opening construction 
	 * @param {string} regexp to detect closing construction 
	 * 
	 * @returns {array} - array of folding ranges
	 */
	static getRangesForConstruction(model, startString, endString, semicolon) {
		
		let ranges = [];
		
		const startMatches = Finder.findMatches(model, '(?:^|\\b)?(' + startString + ') ');
		let startMatch = null;

		let template = '(?:^|\\b)?(' + endString + ') ?';
		if (semicolon)
			template += ';';

			const endMatches =  Finder.findMatches(model, '(?:^|\\b)?(' + endString + ') ?;');
		let endMatch = null;
		
		let structFound = false;
		let subidx = 0;

		if (startMatches && endMatches) {
			
			for (let idx = 0; idx < startMatches.length; idx++) {

				structFound = false;
				startMatch = startMatches[idx];				
										
				subidx = 0;

				while (!structFound && subidx < endMatches.length) {
					
					endMatch = endMatches[subidx];

					if (endMatch.range.startColumn == startMatch.range.startColumn && startMatch.range.startLineNumber < endMatch.range.startLineNumber) {
						structFound = true;
						ranges.push(
							{
								kind: monaco.languages.FoldingRangeKind.Region,
								start: startMatch.range.startLineNumber,
								end: endMatch.range.startLineNumber
							}
						)
					}

					subidx++;
				}				

			}

		}

		return ranges;

	}	

	/**
	 * Finds blocks like functions by regexp	 
	 * 
	 * @param {ITextModel} current model of editor
	 * @param {string} regexp to detect block 	 
	 * 
	 * @returns {array} - array of folding ranges
	 */
	static getRangesForRegexp(model, regexp) {

		let ranges = [];
		let match = null;
		const matches = Finder.findMatches(model, regexp);
    	
    	if (matches) {
			
      		for (let idx = 0; idx < matches.length; idx++) {
				match = matches[idx];
				ranges.push(
					{
						kind: monaco.languages.FoldingRangeKind.Region,
						start: match.range.startLineNumber,
						end: match.range.endLineNumber
					}
				)
      		}

		}

		return ranges;
	
	}

	/**
	 * Provider for folding blocks
	 * @param {ITextModel} current model of editor
	 * 
	 * @returns {array} - array of folding ranges 
	 */
	static getFoldingRanges(model) {

		let ranges = this.getRangesForRegexp(model, "\"(?:\\n|\\r|\\|)*(?:выбрать|select)(?:(?:.|\\n|\\r)*?)?\"");
		ranges = ranges.concat(this.getRangesForRegexp(model, "(?:^|\\b)(?:функция|процедура).*\\((?:.|\\n|\\r)*?(?:конецпроцедуры|конецфункции)"));
		ranges = ranges.concat(this.getRangesForConstruction(model, "пока|while", "конеццикла|enddo", true));
		ranges = ranges.concat(this.getRangesForConstruction(model, "для .*(?:по|из) .*|for .* (?:to|each) .*", "конеццикла|enddo", true));
		ranges = ranges.concat(this.getRangesForConstruction(model, "если|if", "конецесли|endif", true));
		ranges = ranges.concat(this.getRangesForConstruction(model, "#область|#region", "#конецобласти|#endregion", false));
		ranges = ranges.concat(this.getRangesForConstruction(model, "#если|#if", "#конецесли|#endif", false));

		return ranges;

	}

	/**
	 * Finds query's blocks
	 * 
	 * @param {ITextModel} current model of editor	 
	 * 
	 * @returns {array} - array of folding ranges
	 */
	static getRangesForQuery(model) {

		let ranges = [];		
		let match = null;
		const matches = Finder.findMatches(model, '(?:выбрать|select)[\\w\\s\u0410-\u044F&<>=*+-./,()]+');
				
    	if (matches) {
			
      		for (let idx = 0; idx < matches.length; idx++) {
				
				match = matches[idx];				
				let end = match.range.endLineNumber;
				let context = model.getLineContent(end).trim();

				while (!context) {
					end--;
					context = model.getLineContent(end).trim();
				}					
				
				ranges.push(
					{
						kind: monaco.languages.FoldingRangeKind.Region,
						start: match.range.startLineNumber,
						end: end
					}
				)				

      		}

		}
				
		return ranges;
	
	}

	/**
	 * Finds nested blocks like quries or aggregate functions
	 * 
	 * @param {ITextModel} current model of editor	 
	 * @param {string} regexp regexp pattern for detecting blocks
	 * 
	 * @returns {array} - array of folding ranges
	 */
	static getRangesForNestedBlock(model, regexp) {

		let ranges = [];		
		let match = null;
		const matches = Finder.findMatches(model, regexp);
				
    	if (matches) {
			
			let last_line = editor.getModel().getLineCount();

      		for (let idx = 0; idx < matches.length; idx++) {
				
				match = matches[idx];
				let braces_level = 0;
				let braces_match = false;
				let line = match.range.startLineNumber;				

				while (!braces_match && line <= last_line) {
					let str = model.getLineContent(line)
					let str_match = str.match(/\(/);
					braces_level += str_match != null ? str_match.length : 0;
					str_match = str.match(/\)/);
					braces_level -= str_match != null ? str_match.length : 0;
					braces_match = braces_level < 1;
					line++;
				}
				
				if (braces_match) {
					ranges.push(
						{
							kind: monaco.languages.FoldingRangeKind.Region,
							start: match.range.startLineNumber,
							end: match.range.startLineNumber < line ? line - 1 : line
						}
					)				
				}				

      		}

		}
				
		return ranges;
	
	}

	/**
	 * Finds blocks with query's fields
	 * 
	 * @param {ITextModel} current model of editor	 
	 * @param {string} regexp regexp pattern for detecting blocks
	 * @param {array/false} scopes search scope
	 * @param {boolean} includeStartString include or not the first string of match in block
	 * @param {boolean} includeEndString include or not the last string of match in block
	 * 
	 * @returns {array} - array of folding ranges
	 */
	static getRangesForQueryBlock(model, regexp, scopes, includeStartString, includeEndString) {

		let ranges = [];
		let match = null;
		let matches = [];

		if (scopes) {

			let scope_idx = 0;

			while (scope_idx < scopes.length) {
				let scope = scopes[scope_idx];
				matches = matches.concat(Finder.findMatches(model, regexp, new monaco.Range(scope.start, 1, scope.end + 1, 1)));
				scope_idx++;
			}

		}
		else {
			matches = Finder.findMatches(model, regexp);
		}

		if (matches) {

			for (let idx = 0; idx < matches.length; idx++) {
				match = matches[idx];
				if (1 < match.range.endLineNumber - match.range.startLineNumber) {
					ranges.push(
						{
							kind: monaco.languages.FoldingRangeKind.Region,
							start: match.range.startLineNumber + (includeStartString ? 0 : 1),
							end: match.range.endLineNumber - (includeEndString ? 0 : 1)
						}
					)
				}
			}

		}

		return ranges;

	}

	/**
	 * Provider for folding query's blocks
	 * @param {ITextModel} current model of editor
	 * 
	 * @returns {array} - array of folding ranges 
	 */
	static getQueryFoldingRanges(model) {
		
		let ranges = [];

		let nestedQueries = this.getRangesForNestedBlock(model, '\\((?:\\s|\\r)*(?:выбрать|select)');

		ranges = this.getRangesForQuery(model);				
		ranges = ranges.concat(nestedQueries);
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:выбрать|select)\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\s|\t)*(?:из|from|поместить|into|;)', false, false, false));	
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:где|where)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|group|union|order|;)', false, true, false));		
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:где|where)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|group|union|order|;|\\))', nestedQueries, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:выбор|case)\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\\s|\\t)*(?:конец|end)', false, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:иначе|else)\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\\s|\\t)*(?:конец|end)', false, true, false));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:когда|when)\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\\s|\\t)*(?:тогда|then)', false, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:левое|внешнее|правое|полное|left|outer|right|full)\\s+(?:соединение|join).*\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\\s|\\t)*(?:где|сгруппировать|объединить|упорядочить|where|group|union|order|;)', false, true, false));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:левое|внешнее|правое|полное|left|outer|right|full)\\s+(?:соединение|join).*\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\\s|\\t)*(?:где|сгруппировать|объединить|упорядочить|where|group|union|order|;|\\))', nestedQueries, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:имеющие|havin)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:индексировать|индекс|;)', false, true, false));		
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:имеющие|havin)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:индексировать|индекс|;|\\))', nestedQueries, true, false));		
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:сгруппировать|group)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:имеющие|having|индексировать|index|;)', false, true, false));		
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:сгруппировать|group)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:имеющие|having|индексировать|index|;|\\))', nestedQueries, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|имеющие|где|индексировать|havin|where|index|group|union|order|;)', false, true, false));		
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|имеющие|где|индексировать|havin|where|index|group|union|order|;|\\))', nestedQueries, true, true));
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:индексировать|index)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*;', false, true, true));
		ranges = ranges.concat(this.getRangesForNestedBlock(model, '(?:сумма|максимум|минимум|sum|min|max)\\s*\\('));
				
		return ranges;

	}

	/**
	 * Provider for custom hover popoup
	 * 
	 * @returns {object} - hover object or null
	 */
	getCustomHover() {

		for (const [key, value] of Object.entries(customHovers)) {			
			
			if (key.toLowerCase() == this.word && value) {
				
				let contents = [];

				if (typeof(value) == "object") {
					value.forEach(function(val){
						contents.push({ value: val });
					});
				}
				else {
					contents.push({ value: value });
				}
				
				return {
					range: new monaco.Range(this.lineNumber, this.column, this.lineNumber, this.model.getLineMaxColumn(this.lineNumber)),
					contents: contents
				};				

			}

		}

		return null;

	}

	/**
	 * Provider for hover popoup
	 * 
	 * @returns {object} - hover object or null
	 */
	getHover() {

		let hover = this.getCustomHover();

		if (!hover && !editor.disableNativeHovers) {

			for (const [key, value] of Object.entries(bslGlobals)) {

				for (const [ikey, ivalue] of Object.entries(value)) {

					if (ivalue.hasOwnProperty(this.nameField)) {

						if (ivalue[this.nameField].toLowerCase() == this.word) {

							let contents = [
								{ value: '**' + ivalue[this.nameField] + '**' },
								{ value: ivalue.description }
							]

							if (ivalue.hasOwnProperty('returns')) {
								contents.push(
									{ value: 'Возвращает: ' + ivalue.returns }
								)
							}

							return {
								range: new monaco.Range(this.lineNumber, this.column, this.lineNumber, this.model.getLineMaxColumn(this.lineNumber)),
								contents: contents
							};
						}

					}

				}

			}

		}

		return hover;

	}

	/**
	 * Returns query's text from current position
	 * 
	 * @returns {object} object with text and range or null
	 */
	getQuery() {
		
		const matches = this.model.findMatches('(".*$(?:\\n(?:\\t|\\s)*\\|.*)+")', false, true, false, null, true);

		let idx = 0;
		let match = null;
		let queryFound = false;

		if (matches) {

			while (idx < matches.length && !queryFound) {
				match = matches[idx];				
				queryFound = (match.range.startLineNumber <= this.lineNumber && this.lineNumber <= match.range.endLineNumber);
				idx++;
			}

		}

		return queryFound ? { text: match.matches[match.matches.length - 1], range: match.range } : null;

	}

	/**
   	* Returns format string's text from current position
   	* 
   	* @returns {object} object with text and range or null
   	*/
	getFormatString() {

		const matches = this.model.findMatches('"(.+?)"', false, true, false, null, true)

		let idx = 0;
		let match = null;
		let stringFound = false;

		if (matches) {

			while (idx < matches.length && !stringFound) {
				match = matches[idx];
				stringFound = (
					match.range.startLineNumber == this.lineNumber
					&& this.lineNumber == match.range.endLineNumber
					&& match.range.startColumn <= this.column
					&& this.column <= match.range.endColumn
				);
				idx++;
			}

		}

		return stringFound ? { text: match.matches[0], range: match.range } : null;

	}

	/**
	 * Finds min column in selected lines
	 * 
	 * @param {Selection} current selection
	 * 
	 * @returns {int} min column of selection
	 */
	getMinColumn(selection) {

		let minColumn = 100000;

		for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
			minColumn = Math.min(minColumn, this.model.getLineFirstNonWhitespaceColumn(line));
		}

		return minColumn;

	}

	/**
	 * Add prefix for every selected lines
	 * 
	 * @param {string} prefix
	 * 
	 */
	addPrefix(prefix) {

		let selection = editor.getSelection();
		let minColumn = this.getMinColumn(selection);
		let oneLine = (selection.startLineNumber == selection.endLineNumber);
		let maxLine = 0;

		for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
			if (!(line == selection.endLineNumber && this.column == 1 && this.lineNumber == line) || oneLine) {
				bslHelper.setText(
					prefix +
					this.model.getValueInRange({
						startLineNumber: line,
						startColumn: minColumn,
						endLineNumber: line,
						endColumn: this.model.getLineMaxColumn(line)
					}),
					{
						startLineNumber: line,
						startColumn: minColumn,
						endLineNumber: line,
						endColumn: this.model.getLineMaxColumn(line) + prefix.length
					},
					false
				)
				maxLine = line;
			}
		}

		if (0 < maxLine)
			editor.setSelection(new monaco.Range(selection.startLineNumber, 1, maxLine, this.model.getLineMaxColumn(maxLine)));

	}

	/**
	 * Removes prefix from every selected lines
	 * 
	 * @param {string} prefix
	 * 
	 */
	removePrefix(prefix) {

		let selection = editor.getSelection();
		let maxLine = 0;		

		for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
			
			let firsColumn = this.model.getLineFirstNonWhitespaceColumn(line);
			let startChars = this.model.getValueInRange({
				startLineNumber: line,
				startColumn: firsColumn,
				endLineNumber: line,
				endColumn: Math.min(firsColumn + prefix.length, this.model.getLineMaxColumn(line))
			});

			if (startChars == prefix) {
				bslHelper.setText(					
					this.model.getValueInRange({
						startLineNumber: line,
						startColumn: firsColumn + prefix.length,
						endLineNumber: line,
						endColumn: this.model.getLineMaxColumn(line)
					}),
					{
						startLineNumber: line,
						startColumn: firsColumn,
						endLineNumber: line,
						endColumn: this.model.getLineMaxColumn(line)
					},
					false
				)
				maxLine = line;
			}			
		}		

		if (0 < maxLine)
			editor.setSelection(new monaco.Range(selection.startLineNumber, 1, maxLine, this.model.getLineMaxColumn(maxLine)));

	}

	/**
	 * Add comment for every selected lines
	 */
	addComment() {
		
		this.addPrefix('//');

	}

	/**
	 * Removes comment from every selected lines
	 */
	removeComment() {

		this.removePrefix('//');

	}

	/**
	 * Add word wrap for every selected lines
	 */
	addWordWrap() {
		
		this.addPrefix('|');

	}

	/**
	 * Removes word wrap from every selected lines
	 */
	removeWordWrap() {

		this.removePrefix('|');

	}

	/**
	 * Sets text to current position or range
	 * @param {string} txt text to add
	 * @param {Range|null} range null for current position or Range
	 * @param {bool} usePadding true when need to allign block by fist column of position
	 */
	static setText(txt, range, usePadding) {
		
		let insertRange;

		if (range) {
			if (typeof range === 'string') {
				let rangeObject = JSON.parse(range)
				insertRange = new monaco.Range(rangeObject.startLineNumber, rangeObject.startColumn, rangeObject.endLineNumber, rangeObject.endColumn)
			} else {
				insertRange = range
			}
		} else {
			insertRange = monaco.Range.fromPositions(editor.getPosition())
		}

		let startColumn = insertRange.startColumn;		

		if (usePadding && 1 < startColumn) {
			// Replacing tab to whitespaces for calculation number of appended tabs/whitespaces
			let tabSize = editor.getModel().getOptions().tabSize;
			let valueBefore =  editor.getModel().getValueInRange(
				new monaco.Range(insertRange.startLineNumber, 1, insertRange.startLineNumber, startColumn)
			);
			if (valueBefore.trim().length == 0) {
				startColumn = valueBefore.replace(/\t/g, ' '.repeat(tabSize)).length;
			}
			// Adding tabs/whitespaces for strings starting with the second
			let strings = txt.split('\n');			
			let tabCount = Math.trunc(startColumn / tabSize);
			let spaceCount = startColumn - tabCount * tabSize;
			for (let idx = 1; idx < strings.length; idx++) {
				strings[idx] = '\t'.repeat(tabCount) + ' '.repeat(spaceCount) + strings[idx];
			}
			let newTxt = strings.join('\n');			
			this.setText(newTxt, range, false);
		}
		else {
			let operation = {
				range: insertRange,
				text: txt,
				forceMoveMarkers: true
			};
			editor.executeEdits(txt, [operation]);
		}

	}

	/**
	 * Finds text in model and returns first line number
	 * 
	 * @param {string} string - searching string
	 * 
	 * @returns {int} line number
	 */
	findText(string) {

		let lineNumber = 0;

		const matches = this.model.findMatches(string);

		if (matches.length)
			lineNumber =  matches[0].range.startLineNumber;

		return lineNumber;

	}

	/**
	 * Returns array of words from string
	 *  
	 * @param {string} str string 
	 * 
	 * @returns {array} words 
	 */
	static getWordsFromFormatString(str) {

		const comment = str.indexOf('//');

		if (0 <= comment)
			str = str.substr(0, comment);

		str = str.replace(/"([\s\S]+)?"/u, '');
		str = str.replace(/"([\s\S]+)?$/u, '');
		str = str.replace(/\|([\s\S]+)?"/u, '');
		str = str.replace(/\|([\s\S]+)?$/u, '');

		const semi = str.indexOf(';');

		if (0 <= semi)
			str = str.substr(0, semi);

		return str.trim().split(' ');

	}

	/**
	 * Code formatter
	 * 
	 * @param {ITextModel} model current model of editor
	 * 
	 * @returns {string} formated text
	 */
	static formatCode(model) {

		let result = '';

		const startWords = [
			'если', '#если', 'для', 'пока', 'функция', 'процедура', 'попытка',
			'if', '#if', 'for', 'while', 'function', 'procedure', 'try'
		];

		const stopWords = [
			'конецесли', '#конецесли', 'конеццикла', 'конецфункции', 'конецпроцедуры', 'конецпопытки',
			'endif', '#endif', 'enddo', 'endfunction', 'endprocedure', 'endtry'
		];

		const complexWords = [
			'исключение', 'иначе', 'иначеесли', '#иначе', '#иначеесли',
			'except', 'else', 'elseif', '#else', '#elseif'
		];

		let format_range = model.getFullModelRange();
		const selection = editor.getSelection();
		const selected_text = model.getValueInRange(selection).trim();
		let offset = 0;

		let strings = '';

		if (selected_text) {

			format_range = new monaco.Range(
				selection.startLineNumber,
				1,
				selection.endLineNumber,
				model.getLineMaxColumn(selection.endLineNumber)
			);
			strings = model.getValueInRange(format_range).split('\n');

			let line_number = selection.startLineNumber - 1;

			while (0 < line_number && offset == 0) {

				let str = model.getLineContent(line_number)
				let words = bslHelper.getWordsFromFormatString(str);
				let word_i = 0;

				while (word_i < words.length && offset == 0) {
					let word = words[word_i].toLowerCase();
					if (startWords.includes(word)) {
						str = model.normalizeIndentation(str);
						offset = str.match(/^(\t*)/)[0].split('\t').length;
					}
					word_i++;
				}

				line_number--;

			}


		}
		else {
			strings = model.getValue().split('\n');
		}

		strings.forEach(function (str, index) {

			let original = str;
			const words = bslHelper.getWordsFromFormatString(str);
			let word_i = 0;
			let delta = offset;

			while (word_i < words.length) {

				let word = words[word_i].toLowerCase();

				if (startWords.includes(word))
					offset++;

				if (stopWords.includes(word))
					offset = Math.max(0, offset - 1);

				if (complexWords.includes(word))
					offset = Math.max(0, offset - 1);

				word_i++;
			}

			delta = offset - delta;
			let strOffset = 0 < delta ? offset - 1 : offset;
			result = result + '\t'.repeat(strOffset) + original.trim();

			if (index < strings.length - 1)
				result += '\n';

			if (words.length && complexWords.includes(words[0].toLowerCase()))
				offset++;

		});

		return [{
			text: result,
			range: format_range
		}];
	}

	/**
	 * Handler of hoverProvider
	 * for EVENT_BEFORE_HOVER generation
	 */
	onProvideHover() {

		let fire_event = getOption('generateBeforeHoverEvent');

		if (fire_event) {
			let token = this.getLastToken();
			let params = {
				word: this.model.getWordAtPosition(this.position),
				token: token,
				line: this.lineNumber,
				column: this.column,
				altKey: altPressed,
				ctrlKey: ctrlPressed,
				shiftKey: shiftPressed
			}
			sendEvent('EVENT_BEFORE_HOVER', params);
		}

	}

	/**
	 * Handler of completionProvider
	 * for EVENT_BEFORE_SHOW_SUGGEST generation
	 * @param {CompletionContext} context 
	 * @param {object} list of completion 
	 */
	onProvideCompletion(context, completion) {

		let fire_event = getOption('generateBeforeShowSuggestEvent');

		if (fire_event) {
			
			let rows = [];
			if (Object.keys(completion).length) {
				for (const [key, value] of Object.entries(completion.suggestions)) {
					rows.push(value.label);
				}                        
			}

			let trigger = context.triggerCharacter;
			
			if (!trigger) {
				switch (editor.lastKeyCode) {
					case 1:
						trigger = 'backspace';
						break;
					case 10:
						trigger = 'space';
						break;
					default:
						trigger = undefined;
				}
			}

			generateEventWithSuggestData('EVENT_BEFORE_SHOW_SUGGEST', trigger, null, rows);
		}

	}
	
	/**
	 * Looking for color in the global collection of colors
	 * by it's name
	 * @param {string} the name of color
	 * 
	 * @returns {object} color
	 */
	static getWebColorByName(colorName) {

		for (const [key, value] of Object.entries(window.colors.WebColors)) {
			if (value.name.toLowerCase() == colorName || value.name_en.toLowerCase() == colorName)
				return value;
		}

		return null;

	}

	/**
	 * Extracts color parameters from string 
	 * @param {string} color string like "255, 100, 180"
	 * 
	 * @returns {object/null} color
	 */
	static getColorByParams(paramsStr) {

		let color = null;
		let color_params = paramsStr.split(',');

		if (color_params.length == 3) {
			color = {
				r: parseInt(color_params[0]),
				g: parseInt(color_params[1]),
				b: parseInt(color_params[2]),
			}
		}

		return color;

	}

	/**
	 * Returns ColorInformation for provideDocumentColors
	 * @param {ITextModel} current model of editor
	 * 
	 * @returns {array} ColorInformation[]
	 */
	static getDocumentColors(model) {

		let document_colors = [];

		let pattern = 'WebЦвета\.([a-zA-Z\u0410-\u044F]+)|WebColors\.([a-zA-Z\u0410-\u044F]+)|Новый Цвет\\s*\\((.*?)\\)|New Color\\s*\\((.*?)\\)';
		let matches = Finder.findMatches(model, pattern);

		for (let idx = 0; idx < matches.length; idx++) {

			let match = matches[idx];

			let word = match.matches[0].toLowerCase();

			if (0 <= word.indexOf('web') && colors.hasOwnProperty('WebColors')) {

				let color = this.getWebColorByName(match.matches[1].toLowerCase());

				if (color) {
					document_colors.push({
						color: { red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: 1 },
						range: {
							startLineNumber: match.range.startLineNumber,
							startColumn: match.range.startColumn,
							endLineNumber: match.range.startLineNumber,
							endColumn: match.range.startColumn
						}
					});
				}

			}
			else if (match.matches.length == 5 && typeof (match.matches[3]) == 'string') {

				let color = this.getColorByParams(match.matches[3]);

				if (color) {
					document_colors.push({
						color: { red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: 1 },
						range: {
							startLineNumber: match.range.startLineNumber,
							startColumn: match.range.startColumn,
							endLineNumber: match.range.startLineNumber,
							endColumn: match.range.startColumn
						}
					});
				}

			}

		}

		return document_colors;

	}

	/**
	 * Provide the string representations for a color.
	 * @param {ITextModel} current model of editor 
	 * @param {IColorInformation} color information
	 * 
	 * @returns {array} ColorPresentation[]
	 */
	static provideColorPresentations(model, colorInfo) {

		let textEdit = null;
		let pattern = 'WebЦвета\.([a-zA-Z\u0410-\u044F]+)|WebColors\.([a-zA-Z\u0410-\u044F]+)|Новый Цвет\\s*\\((.*?)\\)|New Color\\s*\\((.*?)\\)';
		let range = colorInfo.range;

		let match = Finder.findNextMatch(model, pattern, new monaco.Position(range.startLineNumber, range.startColumn));

		let color = colorInfo.color;
		let red = Math.round(color.red * 255);
		let green = Math.round(color.green * 255);
		let blue = Math.round(color.blue * 255);

		if (match && match.range.startLineNumber == range.startLineNumber) {
			let value = window.engLang ? 'New Color' : 'Новый Цвет';
			value = value + "(" + red + ", " + green + ", " + blue + ")";
			textEdit = { range: match.range, text: value };
		}

		return [{
			label: '',
			textEdit: textEdit
		}];
	}

	/**
	 * Definition event generator
	 * 
	 */
	generateDefinitionEvent() {

		if (editor.generateDefinitionEvent) {

			let expression = this.lastExpression;
			let last_exp_arr = expression.split('.');
			let full_exp_array = this.getRawExpressioArray();

			let module_name = '';
			let class_name = '';			

			if (2 < full_exp_array.length && full_exp_array[full_exp_array.length - 2] == '.')
				class_name = full_exp_array[full_exp_array.length - 3];

			full_exp_array[full_exp_array.length - 1] = this.word;

			if (1 < last_exp_arr.length) {
				
				last_exp_arr[last_exp_arr.length - 1] = this.word;
				expression = last_exp_arr.join('.');
				let first_exp = last_exp_arr[0].toLocaleLowerCase();

				for (const [key, value] of Object.entries(bslMetadata.commonModules.items)) {

					if (key.toLowerCase() == first_exp) {
						module_name = key;
						break;
					}

				}

			}
			else {

				for (const [key, value] of Object.entries(bslMetadata.commonModules.items)) {

					if (key.toLowerCase() == this.word) {
						module_name = this.word;
						break;
					}

					if (key.toLowerCase() == class_name) {
						module_name = class_name;
						break;
					}

				}

			}

			if (module_name.toLowerCase() == class_name.toLowerCase())
				class_name = '';

			let event_params = {
				word: this.word,
				expression: expression,
				module: module_name,
				class: class_name,
				line: this.lineNumber,
				column: this.column,
				expression_array: full_exp_array,
			}

			sendEvent('EVENT_GET_DEFINITION', event_params);

		}

	}

	/**
	 * Provide the definition of the symbol at the given position of code
	 * 
	 * @returns {array} Location[]
	 */
	provideDefinition() {

		let location = null;
		
		if (this.word) {

			let exp_arr = this.lastExpression.split('.');

			if (exp_arr.length == 1) {

				let pattern = this.word + '\\s*=\\s*.*';
				let is_function = this.isItFunction()

				if (is_function)
					pattern = '(процедура|procedure|функция|function)\\s*' + this.word + '\\(';

				let position = new monaco.Position(this.lineNumber, 1);
				let match = Finder.findPreviousMatch(this.model, pattern, position, false);

				if (match && (is_function || match.range.startLineNumber < this.lineNumber)) {
					location = [{
						uri: this.model.uri,
						range: match.range
					}];
				}

			}

			this.generateDefinitionEvent();

		}

		return location;

	}

	/**
	 * Provide the definition of the symbol at the given position of query
	 * 
	 * @returns {array} Location[]
	 */
	provideQueryDefinition() {

		let location = null;

		if (this.word) {

			if (this.wordHasCharsBefore('.')) {

				let pattern = '(as|как)\\s*' + this.word;
				let position = new monaco.Position(this.lineNumber, 1);
				let match = Finder.findPreviousMatch(this.model, pattern, position, false);

				if (match && match.range.startLineNumber < this.lineNumber) {
					location = [{
						uri: this.model.uri,
						range: match.range
					}];
				}

			}
			else if (this.wordHasCharsAfter('.')) {

				let pattern = '(as|как)\\s*' + this.word;
				let position = new monaco.Position(this.lineNumber, this.model.getLineMaxColumn(this.lineNumber));
				let match = Finder.findNextMatch(this.model, pattern, position, false);

				if (match && match.range.startLineNumber > this.lineNumber) {
					location = [{
						uri: this.model.uri,
						range: match.range
					}];
				}

			}
			else {

				let pattern = '(поместить|into)[\\s\\n\\t]*' + this.word;
				let position = new monaco.Position(this.lineNumber, 1);
				let match = Finder.findPreviousMatch(this.model, pattern, position, false);

				if (match && match.range.startLineNumber < this.lineNumber) {
					location = [{
						uri: this.model.uri,
						range: match.range
					}];
				}

			}

		}

		return location;

	}

}