import Finder from "./finder";

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

		let wordData = model.getWordAtPosition(position);
		this.word = wordData ? wordData.word.toLowerCase() : '';

		this.lastOperator = '';
		this.hasWhitespace = false;

		this.textBeforePosition = this.getTextBeforePosition();
		this.lastExpression = this.getLastExpression();
		this.lastRawExpression = this.getLastRawExpression();
		
		this.nameField = window.engLang ? 'name_en': 'name';
		this.queryNameField = window.engLang ? 'query_name_en' : 'query_name';
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

		let lang_id = '';

		if (window.queryMode)
			lang_id = 'bsl_query';
		else if (window.DCSMode)
			lang_id = 'dcs_query';
		else
			lang_id = 'bsl';

		return lang_id;

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

		let match = this.model.findPreviousMatch('[\\s\\n]', position, true)
		
		if (match) {
			
			let match_pos = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (match_pos.lineNumber < position.lineNumber || match_pos.lineNumber == position.lineNumber && match_pos.column < position.column) {

				position = match_pos;
				match = this.model.findPreviousMatch('[a-zA-Z0-9\u0410-\u044F]+', position, true, false, null, true);

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
		let match = this.model.findPreviousMatch(pattern, position, true, false, null, true);
		let step = 0;

		while (match && step < nstep) {			
			words.push(match.matches[0]);
			position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);
			match = this.model.findPreviousMatch(pattern, position, true, false, null, true);
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

		let match = this.model.findPreviousMatch('(', this.position, false);
		
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

		let match = window.editor.getModel().findPreviousMatch('\\s+(ссылка|refs)\\s+' , window.editor.getPosition(), true);		
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
	 * Replacement for monaco's findPreviousMatch
	 * https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.itextmodel.html#findpreviousmatch
	 * because it does't work linux
	 * @param {ITextModel} model 
	 * @param {string} pattern to look for
	 * @param {IPosition} start position
	 * @param {bool} allow looping or not
	 * @returns 
	 */
	findPreviousMatch(model, pattern, position, allowLooping = true) {

		const code = model.getValue();
		const offset = model.getOffsetAt(position);
		let match = null;
		let previous_match = null;
		let last_match = null;

		let regexp = RegExp(pattern, 'gmi');

		while ((match = regexp.exec(code)) !== null) {

			last_match = match;

			if (match.index < offset)
				previous_match = match;
			else
				break;

		}

		if (!previous_match & allowLooping)
			previous_match = last_match;

		if (previous_match) {
			let text = previous_match[0];
			let start_position = model.getPositionAt(previous_match.index);
			let end_position = model.getPositionAt(previous_match.index + text.length);
			return {
				range: new monaco.Range(start_position.lineNumber, start_position.column, end_position.lineNumber, end_position.column),
				matches: previous_match
			}
		}
		else
			return null;

	}

	/**
	 * Replacement for monaco's findPreviousMatch
	 * https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.itextmodel.html#findnextmatch
	 * because it does't work linux
	 * @param {ITextModel} model 
	 * @param {string} pattern to look for
	 * @param {IPosition} start position
	 * @param {bool} allow looping or not
	 * @returns 
	 */
	 findNextMatch(model, pattern, position, allowLooping = true) {

		const code = model.getValue();
		const offset = model.getOffsetAt(position);
		let match = null;
		let next_match = null;
		let first_match = null;

		let regexp = RegExp(pattern, 'gmi');

		while ((match = regexp.exec(code)) !== null && !next_match) {

			if (!first_match)
				first_match = match;

			if (match.index > offset)
				next_match = match;
			

		}

		if (!next_match && allowLooping)
			next_match = first_match;

		if (next_match) {
			let text = next_match[0];
			let start_position = model.getPositionAt(next_match.index);
			let end_position = model.getPositionAt(next_match.index + text.length);
			return {
				range: new monaco.Range(start_position.lineNumber, start_position.column, end_position.lineNumber, end_position.column),
				matches: next_match
			}
		}
		else
			return null;

	}

	/**
	 * Fills array of completition for language keywords, classes, global functions,
	 * global variables and system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getCommonCompletition(suggestions, data, kind, allowAtStart) {

		let word = this.word;
		let emptyString = (this.textBeforePosition.slice(0, -1).trim() === '');		

		if (word && (allowAtStart || !emptyString)) {

			let values = [];				
			for (const [key, value] of Object.entries(data)) {
								
				if (value.hasOwnProperty(this.nameField)) {

					let postfix = '';
					let signatures = [];

					if (kind == monaco.languages.CompletionItemKind.Constructor) {
						signatures = this.getConstructSignature(value);
						if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
							postfix = '()';
					}
					else if (kind == monaco.languages.CompletionItemKind.Function) {
						signatures = this.getMethodsSignature(value);
						if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
							postfix = '()';
					}

					let command = null;
			
					let ref = null;
					if (value.hasOwnProperty('ref'))
						ref = value.ref;

					if (ref || signatures.length) {
						// If the attribute contains a ref, we need to run the command to save the position of ref
						command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": value[this.nameField], "data": { "ref": ref, "sig": signatures } }] }
					}

					let template = value.hasOwnProperty('template') ? value.template : '';

					values.push({ name: value[this.nameField], detail: value.description, description: value.hasOwnProperty('returns') ? value.returns : '', postfix: postfix, template: template, command: command });

				}
				else {

					if ( (key != 'ru' && key != 'en') || (key == 'ru' && !window.engLang) || (key == 'en' && window.engLang)) {

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
	objectHasPropertiesFromArray(obj, props) {

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
	setObjectProperty(obj, path, value) {
		
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

				let postfix = '';

				signatures = this.getMethodsSignature(mvalue);
				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';

				let command = null;
			
				let ref = null;
				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref;

				if (ref && ref.indexOf(':') != -1) {
					if (metadataKey && medatadaName) {
						ref = metadataKey + '.' + medatadaName + '.' +((ref.indexOf(':obj') != -1) ? 'obj' : 'ref');
					}
				}

				if (ref || signatures.length) {
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": mvalue[this.nameField], "data": { "ref": ref, "sig": signatures } }] }
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
						
			for (let i = 0; i < arrRefs.length; i++) {
			
				let refArray = arrRefs[i].trim().split('.');

				if (refArray.length >= 2) {

					let itemName = refArray[0];
					let subItemName = refArray[1];

					if (window.queryMode || window.DCSMode) {
						if (this.objectHasProperties(window.bslMetadata, itemName, 'items', subItemName, 'properties'))
							this.fillSuggestionsForMetadataItem(suggestions, window.bslMetadata[itemName].items[subItemName]);
						else if (this.objectHasProperties(window.bslMetadata, itemName, 'items', subItemName))
							window.requestMetadata(itemName + '.' + subItemName);
						else if (this.objectHasProperties(window.bslMetadata, itemName, 'items'))
							window.requestMetadata(itemName);						
					}
					else {
						if (itemName == 'classes' || itemName == 'types') {
							if (this.objectHasProperties(window.bslGlobals, itemName, subItemName)) {
								this.getClassSuggestions(suggestions, window.bslGlobals[itemName][subItemName]);
							}
						}
						else if (itemName == 'systemEnum') {
							if (this.objectHasProperties(bslGlobals, itemName, subItemName)) {
								this.getSystemEnumSuggestions(suggestions, bslGlobals[itemName][subItemName]);
							}
						}
						else {

							let isObject = (refArray.length == 3 && refArray[2] == 'obj');
							let methodsName = isObject ? 'objMethods' : 'refMethods'

							if (this.objectHasProperties(window.bslMetadata, itemName, 'items', subItemName, 'properties')) {
								this.fillSuggestionsForMetadataItem(suggestions, window.bslMetadata[itemName].items[subItemName]);
								this.getMetadataMethods(suggestions, window.bslMetadata[itemName], methodsName, itemName, subItemName);
								if (isObject)
									this.getMetadataCommmonObjectProperties(suggestions, window.bslMetadata[itemName]);
							}
							else if (this.objectHasProperties(window.bslMetadata, itemName, 'items', subItemName))
								window.requestMetadata(itemName + '.' + subItemName);
							else if (this.objectHasProperties(window.bslMetadata, itemName, 'items'))
								window.requestMetadata(itemName);

						}
					}

				}

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
	 getRefCompletitionFromPosition(suggestions, currentPosition, allowLookBehind) {
		
		let wordContext = null;
		let match = this.model.findPreviousMatch('.', currentPosition, false);
		
		if (match) {

			let position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = currentPosition.lineNumber) {

				let lineContextData = window.contextData.get(position.lineNumber)

				if (lineContextData) {

					let wordUntil = this.model.getWordUntilPosition(position);
					if (wordUntil.word) {
						wordContext = lineContextData.get(wordUntil.word.toLowerCase());
						this.getRefSuggestions(suggestions, wordContext)
					}
					else if (this.lastOperator == ')') {
						wordContext = lineContextData.get(this.lastRawExpression);
						this.getRefSuggestions(suggestions, wordContext)
					}
					
				}

				if (!suggestions.length && allowLookBehind) {
					
					// 1C does not support positive/negative lookbehind yet
					//match = this.model.findPreviousMatch('(?<!\\/\\/.*)' + this.lastRawExpression + '\\s?=\\s?.*\\.([^.]*?)\\s?(?:;|\\()', this.position, true, false, null, true);
					
					// This also does not work inside 1C
					/*
					match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?.*\\.([^.]*?)\\s?(?:;|\\()', this.position, true, false, null, true);
					if (!match)
						match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?([a-zA-Z0-9\u0410-\u044F_]+)\\(', this.position, true, false, null, true);
					*/
					
					// So we have to use 2 rexep to detect last function`s (field`s) reference
					match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?.*', currentPosition, true, false, null, true);					
			
					if (match) {

						position = new monaco.Position(match.range.endLineNumber, match.range.endColumn);

						match = this.model.findPreviousMatch('\\.([^.]*?)\\s?(?:;|\\()', position, true, false, null, true);					

						if (!match)
							match = this.model.findPreviousMatch('([a-zA-Z0-9\u0410-\u044F_]+)\\(', position, true, false, null, true);

						if (match) {

							lineContextData = window.contextData.get(match.range.startLineNumber);

							if (lineContextData) {
								wordContext = lineContextData.get(match.matches[match.matches.length - 1].toLowerCase());
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
	getRefCompletition(suggestions) {
		
		this.getRefCompletitionFromPosition(suggestions, this.position, true);
		
	}

	/**
	 * Fills array of completition for language keywords, classes, global functions,
	 * global variables and system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getCustomObjectsCompletition(suggestions, data, kind) {

		let objName = this.getLastNExpression(2);
		let word = this.lastRawExpression;

		if (this.getLastCharacter() == '.' && objName) {

			for (const [key, value] of Object.entries(data)) {
				
				for (const [ikey, ivalue] of Object.entries(value)) {
					
					if (ikey.toLowerCase() == objName) {
						
						this.fillSuggestionsForMetadataItem(suggestions, ivalue);
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
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet							
						});
					}
					
				}

			}

		}		

	}

	/**
	 * Fills the suggestions for objects from window.bslGlobals 
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
				let postfix = '';
				if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
					postfix = '()';
				
				let command = null;
				
				let ref = null;
				if (mvalue.hasOwnProperty('ref'))
					ref = mvalue.ref;

				if (ref || signatures.length) {					
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{ "name": mvalue[this.nameField], "data": { "ref": ref, "sig": signatures } }] };
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
	 * Fills array of completition for class methods, properties and
	 * system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} className name of class
	 */
	getClassCompletitionByName(suggestions, data, className) {

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
	 * Fills array of completition for class names	 
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
	 * Fills array of completition for class methods, properties and
	 * system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {boolean} onlyQuickAccess allow include in suggestions only elements with special property
	 */
	getClassCompletition(suggestions, data, onlyQuickAccess) {

		let classExists = false;
		let className = '';
		let exp = this.lastRawExpression;

		if (exp) {

			// 1C does not support positive/negative lookbehind yet
			// const match = this.model.findPreviousMatch('(?<!\\/\\/.*)' + exp + '\\s?=\\s?(?:new|новый)\\s+(.*?)(?:\\(|;)', this.position, true, false, null, true);		
			const match = this.model.findPreviousMatch(exp + '\\s?=\\s?(?:new|новый)\\s+(.*?)(?:\\(|;)', this.position, true, false, null, true);

			if (match) {										
				className = match.matches[match.matches.length - 1];
				className = className ? className.toLowerCase() : '';
			}
			else {			
				className = exp;
			}
			
			if (onlyQuickAccess && (className == 'new' || className == 'новый')) {
				
				this.getClassNamesCompletion(suggestions, data, true)

			}
			else {

				classExists = this.getClassCompletitionByName(suggestions, data, className);

				if (!classExists) {
					let unclosed = this.unclosedString(this.textBeforePosition);
					let regex = null;
					if (unclosed.string)
						regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(unclosed.string.slice(1));
					else
						regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(this.lastExpression);
					className = regex && 1 < regex.length ? regex[1] : '';
					if (!this.lastOperator && !this.hasWhitespace)
						classExists = this.getClassCompletitionByName(suggestions, data, className);
				}

			}

		}

		return classExists;

	}


	/**
	 * Gets the list of properties (attributes) owned by object
	 * (Catalog, Document, etc) and fills the suggestions by it
	 * 
	 * @param {array} suggestions the list of suggestions
	 * @param {object} obj object from BSL-JSON dictionary
	 */
	fillSuggestionsForMetadataItem(suggestions, obj) {

		let objects = [];
		
		if (obj.hasOwnProperty('properties'))
			objects.push(obj.properties);

		if (obj.hasOwnProperty('resources'))
			objects.push(obj.resources);

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

				if (pvalue.hasOwnProperty('description'))
					detail = pvalue.description;				
				else if (pvalue.hasOwnProperty('name'))
					detail = pvalue.name;

				if (pvalue.hasOwnProperty('properties'))
					this.fillSuggestionsForMetadataItem(nestedSuggestions, pvalue);

				if (pvalue.hasOwnProperty('methods'))
					this.getMetadataMethods(nestedSuggestions, pvalue, 'methods', null, null);

				if (ref || nestedSuggestions.length) {					
					// If the attribute contains a ref, we need to run the command to save the position of ref
					command = { id: 'vs.editor.ICodeEditor:1:saveref', arguments: [{'name': pkey, "data": { "ref": ref, "sig": null, "list" : nestedSuggestions } }]}
				}

				suggestions.push({
					label: pkey,
					kind: monaco.languages.CompletionItemKind.Field,
					insertText: pkey + postfix,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					detail: detail,
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
	 * Fills array of completition for metadata subitem	like catalog of products
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
	getMetadataItemCompletitionFromFullDefinition(suggestions, data, metadataName, metadataItem, metadataFunc) {

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

									itemExists = true;
									this.fillSuggestionsForMetadataItem(suggestions, ivalue);
									this.getMetadataMethods(suggestions, value, methodsName, key, ikey);

									if (isObject)
										this.getMetadataCommmonObjectProperties(suggestions, value);

									refType = key + '.' + ikey + (methodsName == 'objMethods' ? '.obj' : '');									

								}
								else {

									window.requestMetadata(metadataName.toLowerCase() + '.' + metadataItem.toLowerCase());
									
								}
							}

						}

					}
					else {

						window.requestMetadata(metadataName.toLowerCase());

					}

				}

			}

		}

		return {itemExists: itemExists, refType: refType};

	}

	/**
	 * Fills array of completition for metadata subitem	like catalog of products
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary	 
	 */
	getMetadataItemCompletition(suggestions, data) {

		let itemExists = false;

		let exp = this.lastRawExpression;
		
		if (exp) {

			let fullText = this.getFullTextBeforePosition();
			let regex = null
			
			try {
				regex = new RegExp(exp + '\\s?=\\s?(.*)\\(.*\\);', 'gi');
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
					let result = this.getMetadataItemCompletitionFromFullDefinition(suggestions, data, metadataName, metadataItem, metadataFunc);
					itemExists = result.itemExists;
				}
			}

		}

		return itemExists;

	}

	/**
	 * Fills array of completition for metadata item like Catalogs,
	 * Documents, InformationRegisters, etc.
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 */
	getMetadataCompletition(suggestions, data) {

		let metadataExists = false;

		let unclosed = this.unclosedString(this.textBeforePosition);

		let regex = null;

		if (unclosed.string)
			regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(unclosed.string.slice(1));
		else
			regex = /(.+?)(?:\.(.*?))?\.?(?:\.(.*?))?\(?$/.exec(this.lastExpression);
		
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
									});
																									
								}

							}

							if (value.hasOwnProperty('methods')) {

								for (const [mkey, mvalue] of Object.entries(value.methods)) {

									let description = mvalue.hasOwnProperty('returns') ? mvalue.returns : '';
									let signatures = this.getMethodsSignature(mvalue);
									let postfix = '';
									if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
										postfix = '()';
									
									values.push({
										name: mvalue[this.nameField],
										postfix: postfix,
										detail: mvalue.description,
										description: description,
										kind: monaco.languages.CompletionItemKind.Method,
										insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
									});									

								}

							}
							
							if (key == 'enums') {
								this.fillSuggestionsForMetadataItem(suggestions, itemNode)
							}

						} else {

							if (Object.keys(value.items).length) {

								for (const [ikey, ivalue] of Object.entries(value.items)) {
									values.push({
										name: ikey,
										detail: '',
										description: '',
										postfix: '',
										kind: monaco.languages.CompletionItemKind.Field
									});
								}

							}
							else {
								window.requestMetadata(metadataName);
							}

						}

						values.forEach(function (value) {

							suggestions.push({
								label: value.name,
								kind: value.kind,
								insertText: value.insertText ? value.insertText : value.name + value.postfix,
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								detail: value.detail,
								documentation: value.description
							});

						});

					}
				}

			}

			if (updateItemNode) {
				window.requestMetadata(metadataName + '.' + metadataItem);
				suggestions = [];
			}
			else if (metadataName && metadataExists && !metadataItem && !suggestions.length)				
				window.requestMetadata(metadataName);

		}

		if (!metadataExists)
			metadataExists = this.getMetadataItemCompletition(suggestions, data);

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
		let match = this.model.findPreviousMatch('(' + varName + '\\s?=\\s?(.*?))\\.(.*)', position, true, false, null, true);

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

					stack.push({
						var: expression.toLowerCase(),						
						line: match.range.startLineNumber,
						previous_ref: false,
						column: column
					});

				}				
				
				let prev_stack = this.getMetadataStackForVar(source_var, new monaco.Position(position.lineNumber, match.range.startColumn));
				stack = prev_stack.concat(stack);

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
	 * 
	 * @returns {object} object containing the ref
	 */
	setContextDataForRefExpression(expression, ref, line) {
												
		let lineContextData = window.contextData.get(line);
		
		if (!lineContextData) {
			window.contextData.set(line, new Map());
		}

		lineContextData = window.contextData.get(line);
		let data = { "ref": ref, "sig": null };
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
																	
					return this.setContextDataForRefExpression(exp_name, command.arguments[0].data.ref, item.line);

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

		for (const [key, value] of Object.entries(window.bslMetadata.customObjects.items)) {

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
	getMetadataStackCompletitionFromFullDefinition(suggestions, stack) {

		let itemExists;
		let min_stack_size  = 4; // min stack size when variable define like Спр = Справочники.Номенклатура.НайтиПоКоду
		
		if (min_stack_size < stack.length) {
			
			let metadata_suggestions = [];

			let metadataName = stack[0].var;
			let metadataItem = stack[1].var;
			let metadataFunc = stack[2].var;
			let result = this.getMetadataItemCompletitionFromFullDefinition(metadata_suggestions, window.bslMetadata, metadataName, metadataItem, metadataFunc);
			itemExists = result.itemExists;			

			if (itemExists) {

				let prev_ref = null;

				for(let i = 3; i < stack.length; i++) {
				
					let stack_item = stack[i];
					if (i == 3) 
						prev_ref = this.setContextDataForRefExpression(stack_item.var, result.refType, stack_item.line);
					else {
						metadata_suggestions = [];
						if (stack_item.previous_ref && prev_ref != null) {
							prev_ref = this.setContextDataForRefExpression(stack_item.var, prev_ref.ref, stack_item.line)
						}
						else {
							let prev_item = stack[i - 1];
							let position = new monaco.Position(prev_item.line, prev_item.column + 1);
							this.getRefCompletitionFromPosition(metadata_suggestions, position, false);
							prev_ref = this.setContextDataForStackItem(stack_item, metadata_suggestions);
						}
					}

					if (i + 1 == stack.length) {
						this.getRefCompletition(suggestions);
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
	getMetadataStackCompletitionFromRefs(suggestions, stack) {

		let prev_ref = null;

		for(let i = 0; i < stack.length; i++) {
		
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
					prev_ref = this.getRefCompletitionFromPosition(metadata_suggestions, position, false);
					if (!prev_ref && i + 1 < stack.length && window.bslMetadata.customObjects.hasOwnProperty('items'))
						this.setContextDataForCustomObjectFromStack(stack, stack_item, i);
				}
				else {					
					this.getRefCompletitionFromPosition(metadata_suggestions, position, false);
					prev_ref = this.setContextDataForStackItem(stack_item, metadata_suggestions);
				}
			}
												
			if (i + 1 == stack.length) {
				this.getRefCompletition(suggestions);
			}

		}

	}

	/**
	 * Constructs completition using stack of all variables,
	 * methods and properties that preceded the object
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 */
	getMetadataStackCompletition(suggestions) {

		let exp = this.lastRawExpression;		
		let stack = this.getMetadataStackForVar(exp, this.position);
		let itemExists = this.getMetadataStackCompletitionFromFullDefinition(suggestions, stack);		

		if (!itemExists) {
			this.getMetadataStackCompletitionFromRefs(suggestions, stack);
		}

	}

	/**
	 * Fills array of completition for types	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getTypesCompletition(suggestions, data, kind) {

		let subType = this.getLastNExpression(2);

		for (const [key, value] of Object.entries(data)) {

			let values = [];
			
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

					if (value.hasOwnProperty('ref') && window.bslMetadata.hasOwnProperty(value.ref) && window.bslMetadata[value.ref].hasOwnProperty('items')) {

						for (const [mkey, mvalue] of Object.entries(window.bslMetadata[value.ref].items)) {

							suggestions.push({
								label: mkey,
								kind: kind,
								insertText: mkey + '"',
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
							});

						}
					}
				}

			}
			
		}

	}

	/**
	 * Looks for variables with assigned a value
	 * 
	 * @param {string} the code
	 * @param {int} currentLine the last line below which we don't search variables
	 * 
	 * @returns {array} array with variables names
	 */
	getAssignedVarsNames(text, currentLine) {

		let names = [];
		let comments = new Map();
		let regexp = RegExp('\/\/', 'g');
		let match = null;

		while ((match = regexp.exec(text)) !== null) {
			let position = this.model.getPositionAt(match.index);
			comments.set(position.lineNumber, position.column);
		}

		regexp = RegExp('([a-zA-Z0-9\u0410-\u044F_]+)\\s?=\\s?.*(?:;|\\()\\s*', 'gi');

		while ((match = regexp.exec(text)) !== null) {

			let position = this.model.getPositionAt(match.index);

			if (position.lineNumber < currentLine || currentLine == 0) {

				let comment = comments.get(position.lineNumber);

				if (!comment || position.column < comment) {

					let varName = match[match.length - 1];

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
	 * @param {string} the code
	 * @param {int} currentLine the last line below which we don't search variables
	 * @param {int} a line number where function is defined
	 * 
	 * @returns {array} array with variables names
	 */
	getFunctionsVarsNames(text, currentLine, funcLine) {

		let names = [];
		let regexp = RegExp('(?:процедура|функция|procedure|function)\\s+[a-zA-Z0-9\u0410-\u044F_]+\\(([a-zA-Z0-9\u0410-\u044F_,\\s=]+)\\)', 'gi');
		let match = null;

		while ((match = regexp.exec(text)) !== null) {

			let position = this.model.getPositionAt(match.index);

			if (position.lineNumber < currentLine || currentLine == 0) {

				let params = match[1].split(',');

				params.forEach(function (param) {
					let paramName = param.split('=')[0].trim();
					if (!names.some(name => name === paramName))
						names.push(paramName);
				});

				if (0 < currentLine)
					funcLine = position.lineNumber;

			}

		}

		return names;

	}

	/**
	 * Looks for variables with default definition
	 * 
	 * @param {string} the code
	 * @param {int} currentLine the last line below which we don't search variables
	 * @param {int} a line number where function is defined
	 * 
	 * @returns {array} array with variables names
	 */
	getDefaultVarsNames(text, currentLine, funcLine) {

		let names = [];
		let regexp = RegExp('(?:перем|var)\\s+([a-zA-Z0-9\u0410-\u044F_,\\s]+);', 'gi');
		let match = null;

		while ((match = regexp.exec(text)) !== null) {

			let position = this.model.getPositionAt(match.index);

			if (currentLine == 0 || funcLine < position.lineNumber) {

				let varDef = match[match.length - 1];

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

		let text = this.model.getValue();
		let names = this.getAssignedVarsNames(text, currentLine);

		let funcLine = 0;
		names = names.concat(this.getFunctionsVarsNames(text, currentLine, funcLine));
		names = names.concat(this.getDefaultVarsNames(text, currentLine, funcLine));

		return names;

	}

	/**
	 * Fills array of completition for variables
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
	 * Completition provider for code-mode
	 * 
	 * @param {CompletionContext} context
	 * @param {CancellationToken} token
	 * 
	 * @returns {array} array of completition
	 */
	getCodeCompletition(context, token) {

		let suggestions = [];

		if (context.triggerCharacter && context.triggerCharacter == ' ') {
			
			this.getClassCompletition(suggestions, window.bslGlobals.classes, true);

		}
		else 
		{

			if (!this.requireType()) {

				if (this.lastOperator != '"') {

					this.getRefCompletition(suggestions);

					if (!suggestions.length) {

						if (!this.getClassCompletition(suggestions, window.bslGlobals.classes, false)) {

							if (!this.getClassCompletition(suggestions, window.bslGlobals.systemEnum, false)) {

								if (!this.getMetadataCompletition(suggestions, window.bslMetadata)) {

									if (!suggestions.length)
										this.getVariablesCompetition(suggestions);

									if (window.engLang)
										this.getCommonCompletition(suggestions, window.bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);
									else
										this.getCommonCompletition(suggestions, window.bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);

									if (this.requireClass()) {
										this.getClassNamesCompletion(suggestions, window.bslGlobals.classes, false);
									}
									else {
										this.getCommonCompletition(suggestions, window.bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function, true);
										this.getCommonCompletition(suggestions, window.bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class, true);
										this.getCommonCompletition(suggestions, window.bslGlobals.systemEnum, monaco.languages.CompletionItemKind.Enum, false);
										this.getCommonCompletition(suggestions, window.bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function, true);
										this.getCommonCompletition(suggestions, window.bslMetadata.commonModules, monaco.languages.CompletionItemKind.Module, true);
										this.getCustomObjectsCompletition(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
									}

									this.getSnippets(suggestions, window.snippets);

								}

							}

						}
					}

					if (!suggestions.length) {
						this.getMetadataStackCompletition(suggestions)
					}

				}

			}
			else {
				this.getTypesCompletition(suggestions, window.bslGlobals.types, monaco.languages.CompletionItemKind.Enum);
			}

		}

		return suggestions;

	}

	/**
	 * Completition provider
	 * 
	 * @param {CompletionContext} context
	 * @param {CancellationToken} token
	 * 
	 * @returns {array} array of completition
	 */
	getCompletition(context, token) {

		let suggestions = this.getCustomSuggestions(true);

		if (!suggestions.length && !window.editor.disableNativeSuggestions) {

			if (!this.isItStringLiteral()) {				
				suggestions = this.getCodeCompletition(context, token);
			}

		}

		if (suggestions.length)
			return { suggestions: suggestions }
		else
			return [];

	}

	/**
	 * Fills array of completition for query values	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryValuesCompletition(suggestions, data, kind) {

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

						if (value.hasOwnProperty('ref') && window.bslMetadata.hasOwnProperty(value.ref) && window.bslMetadata[value.ref].hasOwnProperty('items')) {

							if (metadataItem) {

								for (const [mkey, mvalue] of Object.entries(window.bslMetadata[value.ref].items)) {

									if (mkey.toLowerCase() == metadataItem) {

										if (value.ref == 'enums' && mvalue.hasOwnProperty('properties')) {

											for (const [ikey, ivalue] of Object.entries(window.bslMetadata[value.ref].items[mkey].properties)) {
												suggestions.push({
													label:  ikey,
													kind: kind,
													insertText: ikey + ')',
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
												});
											}

										}
										else if (mvalue.hasOwnProperty('predefined')) {
											
											for (const [pkey, pvalue] of Object.entries(window.bslMetadata[value.ref].items[mkey].predefined)) {
												suggestions.push({
													label:  pvalue ? pvalue : pkey,
													kind: kind,
													insertText: pkey + ')',
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
												});
											}
										}
										else {
											window.requestMetadata(window.bslMetadata[value.ref].name.toLowerCase() + '.' + metadataItem);
										}

										let EmptyRef = window.engLang ? 'EmptyRef' : 'ПустаяСсылка';

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


								if (!Object.keys(window.bslMetadata[value.ref].items).length) {									
									window.requestMetadata(window.bslMetadata[value.ref].name.toLowerCase());
								}
								else {
								
									for (const [mkey, mvalue] of Object.entries(window.bslMetadata[value.ref].items)) {

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
	 * Fills array of completition from array	 
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

					if (window.engLang) {
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

		return 0 <= this.compareVersions(window.version1C, version);

	}

	/**
	 * Returns query functions depending on current version of 1C
	 * @param {object} bslQueryDef query definition like window.bslQuery or window.bslDCS 
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
	 * Fills array of completition for query language`s keywords
	 * and expressions
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} langDef query language definition
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryCommonCompletition(suggestions, kind) {	

		let word = this.word;

		if (word) {

			let values = []			
			let rules = window.languages.bsl.languageDef.rules;

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
	 * Fills array of completition for params of query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryParamsCompletition(suggestions, kind) {

		if (this.lastRawExpression.startsWith('&')) {

			let regexp = RegExp('&([a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*)', 'gi');
			let text = this.model.getValue();
			let match = null;

			while ((match = regexp.exec(text)) !== null) {
				let paramName = match ? match[1] : '';
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

		if (window.engLang) {

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
	 * Fills array of completition for metadata source in query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {string} sourceDefinition source string definition
	 */
	getQueryFieldsCompletitionForMetadata(suggestions, sourceDefinition) {

		let metadataExists = false;

		let sourceArray = sourceDefinition.split('.');

		if (1 < sourceArray.length) {						
			
			metadataExists = true;

			let metadataType = sourceArray[0].toLowerCase();
			let metadataName = sourceArray[1].toLowerCase();
			let metadataSubtable = (2 < sourceArray.length) ? sourceArray[2].toLowerCase() : '';

			for (const [key, value] of Object.entries(window.bslMetadata)) {
				
				if (value.hasOwnProperty(this.queryNameField) && value[this.queryNameField].toLowerCase() == metadataType) {
				
					if (0 < Object.keys(value.items).length) {

						for (const [ikey, ivalue] of Object.entries(value.items)) {

							if (ikey.toLowerCase() == metadataName) {
								
								if (ivalue.hasOwnProperty('properties'))
									this.fillSuggestionsForMetadataItemInQuery(suggestions, ivalue, metadataSubtable);
								else
									window.requestMetadata(value.name.toLowerCase() + '.' + ikey.toLowerCase());

							}

						}

					}
					else {
						
						window.requestMetadata(value.name.toLowerCase());

					}

				}
				
			}
			
		}

		return metadataExists;

	}

	/**
	 * Fills array of completition for temporary table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {string} sourceDefinition source string definition
	 * @param {position} startPosition the begining of current query
	 */
	getQueryFieldsCompletitionForTempTable(suggestions, sourceDefinition, startPosition) {

		let tableExists = false;

		// Let's find definition for temporary table
		let intoMatch = this.model.findPreviousMatch('(?:поместить|into)\\s+' + sourceDefinition, startPosition, true);

		if (intoMatch) {
			
			// Now we need to find start of this query
			let position =  new monaco.Position(intoMatch.range.startLineNumber, intoMatch.range.startColumn);
			let startMatch = this.model.findPreviousMatch('(?:выбрать|select)', position, true);

			if (startMatch) {
				
				// Searching field's definition between select...into
				let searchRange = new monaco.Range(startMatch.range.startLineNumber, 1, intoMatch.range.startLineNumber, 1);				
				let matches = this.model.findMatches('^.*(?:как|as)\\s+([a-zA-Z0-9\u0410-\u044F_]*?),?$', searchRange, true, false, null, true);				
				matches = matches.concat(this.model.findMatches('^\\s*[a-zA-Z0-9\u0410-\u044F_]*\\.([a-zA-Z0-9\u0410-\u044F_]*?)[,\\s]*$', searchRange, true, false, null, true));
				
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
	 * @param {bool} allowChain allow or not call chain completition (to avoid looping)
	 */
	getQueryFieldsChainCompletion(suggestions) {

		let match = this.model.findMatches('[a-zA-Z0-9\u0410-\u044F]+', new monaco.Range(this.lineNumber, 1, this.lineNumber, this.column), true, false, null, true);
		
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
					this.getQueryFieldsCompletition(prev_suggestions, false);					
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
					
							let lineContextData = window.contextData.get(this.position.lineNumber);
					
							if (!lineContextData) {
								window.contextData.set(this.position.lineNumber, new Map());
							}

							lineContextData = window.contextData.get(this.position.lineNumber);
							lineContextData.set(field_name, command_context.data);
							this.getRefCompletition(prev_suggestions);

						}

					}

				}

			}

			this.position = back_pos;
			this.lastRawExpression = back_exp;
			this.getRefCompletition(suggestions);

		}		

	}

	/**
	 * Fills array of completition for fields of querie's table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {bool} allowChain allow or not call chain completition (to avoid looping)
	 */
	getQueryFieldsCompletition(suggestions, allowChain = true) {

		if (this.getLastCharacter() == '.' && this.lastRawExpression) {
			
			// Let's find start of current query
			let startMatch = this.model.findPreviousMatch('(?:выбрать|select)', this.position, true);
			
			if (startMatch) {
								
				// Now we need to find lastExpression definition
				let position =  new monaco.Position(startMatch.range.startLineNumber, startMatch.range.startColumn);

				// Temp table definition
				let sourceDefinition = '';
				let match = this.model.findNextMatch('^[\\s\\t]*([a-zA-Z0-9\u0410-\u044F_]+)\\s+(?:как|as)\\s+' + this.lastRawExpression + '[\\s,\\n]*$', position, true, false, null, true);

				if (match) {

					sourceDefinition = match.matches[1];
					this.getQueryFieldsCompletitionForTempTable(suggestions, sourceDefinition, position);

				}
				else {
					
					// Metadata table definition
					match = this.model.findNextMatch('(?:из|from)[\\s\\S\\n]*?(?:как|as)\\s+' +  this.lastRawExpression + '[\\s,\\n]*$' , position, true);
											
					if (match) {					
											
						// Searching the source
						position =  new monaco.Position(match.range.endLineNumber, match.range.endColumn);
						match = this.model.findPreviousMatch('[a-zA-Z0-9\u0410-\u044F]+\\.[a-zA-Z0-9\u0410-\u044F_]+(?:\\.[a-zA-Z0-9\u0410-\u044F]+)?', position, true, false, null, true);
				
						if (match) {									
							sourceDefinition = match.matches[0];
							this.getQueryFieldsCompletitionForMetadata(suggestions, sourceDefinition);																			
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

		if (window.engLang) {

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
	 * Fills array of completition for virtual tables of registers in source
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} metadataItem name of metadata item like (ЦеныНоменклатуры/ProductPrices, СвободныеОстатки/AvailableStock)
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 	 
	 */
	getQuerySourceMetadataRegTempraryTablesCompletition(data, metadataItem, suggestions) {

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
	 * Fills array of completition for source of table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQuerySourceMetadataCompletition(metadataName, metadataItem, metadataFunc, suggestions, kind, maxLevel) {
	
		let sourceExist = false;

		for (const [key, value] of Object.entries(window.bslMetadata)) {

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
						window.requestMetadata(value.name.toLowerCase());
					}

				}
				else if (!metadataFunc && 2 < maxLevel) {
					this.getQuerySourceMetadataRegTempraryTablesCompletition(value, metadataItem, suggestions)

				}

			}

		}

		return sourceExist;

	}

	/**
	 * Fills array of completition for temporary tables in source
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 	 
	 */
	getQuerySourceTempraryTablesCompletition(suggestions) {

		let sourceExist = false;
		let startMatch = this.model.findPreviousMatch('(?:выбрать|select)', this.position, true);

		if (startMatch) {

			let matches = window.editor.getModel().findMatches('(?:поместить|into)\\s+([a-zA-Z0-9\u0410-\u044F_]+)', null, true, false, null, true);

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

		for (const [key, value] of Object.entries(window.bslMetadata)) {

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
	 * Fills array of completition for source of table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQuerySourceCompletition(suggestions, kind) {

		let sourceExist = false;

		let fromTriggers = ['из', 'соединение', 'from', 'join'];
		let lastWord = this.getLastSeparatedWord()
		
		if (lastWord) {
			
			if (fromTriggers.indexOf(lastWord.toLowerCase()) == -1) {
				
				let char = this.getLastCharInLine(this.lineNumber - 1);
				
				if (char == ',') {
				
					let fromMatch = this.model.findPreviousMatch('(?:из|from)', this.position, true);
				
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
				
				sourceExist = this.getQuerySourceMetadataCompletition(metadataName, metadataItem, metadataFunc, suggestions, kind, 3);

				if (!sourceExist) {
				
					// suggestion for metadata sources like (catalog, document, etc.)
					sourceExist = this.getQueryMetadataSources(suggestions, kind);
					// suggestion for temporary tables
					sourceExist = Math.max(sourceExist, this.getQuerySourceTempraryTablesCompletition(suggestions));
				
				}
												
			}			

		}

		return sourceExist;

	}

	/**
	 * Fills array of completition for tables in the current query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryTablesCompletition(suggestions, kind) {
		
		if (this.getLastCharacter() != '.' && this.getLastCharacter() != '(' && this.lastExpression.indexOf('&') < 0) {

			// Let's find start of current query
			let startMatch = this.model.findPreviousMatch('(?:выбрать|select)', this.position, true);

			if (startMatch) {

				let template = '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|имеющие|где|индексировать|havin|where|index|group|union|order|;)'
				let position = new monaco.Position(startMatch.range.startLineNumber, startMatch.range.startColumn);
				let fromMatch = this.model.findNextMatch(template, position, true);

				if (!fromMatch) {
					template = '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*$';
					fromMatch = this.model.findNextMatch(template, position, true);
				}

				if (fromMatch && fromMatch.range.startLineNumber < startMatch.range.startLineNumber) {								
					// This is loops to the beginning. Trying another template
					fromMatch = this.model.findNextMatch('(?:из|from)\\s+(?:(?:.|\\n|\\r)+)$', position, true);
				}

				if (fromMatch) {
					
					// Now we need to find tables definitions
					let range = new monaco.Range(fromMatch.range.startLineNumber, 1, fromMatch.range.endLineNumber, fromMatch.range.endColumn);
					let matches = this.model.findMatches('\\s+(?:как|as)\\s+([a-zA-Z0-9\u0410-\u044F_]+)', range, true, false, null, true);
					
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
	 * Fills array of completition for refs constructor (ССЫЛКА|REFS)
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryRefCompletition(suggestions, kind) {

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
			this.getQuerySourceMetadataCompletition(metadataName, metadataItem, '', suggestions, kind, 2);		

	}

	/**
	 * Returns completition array from window.customSuggestions
	 * 
	 * @param {bool} erase on not window.customSuggestions
	 * 
	 * @returns {array} array of completition
	 */
	getCustomSuggestions(erase) {

		let suggestions = [];
		
		if (window.customSuggestions.length) {
			
			suggestions = window.customSuggestions.slice();
			window.editor.previousCustomSuggestions = [...suggestions];
			
			if (erase)
				window.customSuggestions = [];

		}

		return suggestions;

	}

	/**
	 * Completition provider for query language	
	 * 
	 * @returns {array} array of completition
	 */
	getQueryCompletition() {

		let suggestions = this.getCustomSuggestions(true);		
		
		if (!suggestions.length && !window.editor.disableNativeSuggestions) {
		
			if (!this.requireQueryValue()) {

				if (!this.requireQueryRef()) {

					if (!this.getQuerySourceCompletition(suggestions, monaco.languages.CompletionItemKind.Enum)) {

						if (this.lastOperator != '"') {
							let functions = this.getQueryFunctions(window.bslQuery);
							this.getCommonCompletition(suggestions, functions, monaco.languages.CompletionItemKind.Function, true);
							this.getRefCompletition(suggestions);
							this.getQueryTablesCompletition(suggestions, monaco.languages.CompletionItemKind.Class);
							this.getCustomObjectsCompletition(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
						}

						this.getQueryCommonCompletition(suggestions, monaco.languages.CompletionItemKind.Module);
						this.getQueryParamsCompletition(suggestions, monaco.languages.CompletionItemKind.Enum);				
						this.getQueryFieldsCompletition(suggestions);
						this.getSnippets(suggestions, window.querySnippets);

					}

				}
				else {
					
					this.getQueryRefCompletition(suggestions, monaco.languages.CompletionItemKind.Enum);

				}

			}
			else {
				
				this.getQueryValuesCompletition(suggestions, window.bslQuery.values, monaco.languages.CompletionItemKind.Enum);

			}
		}

		if (suggestions.length)
			return { suggestions: suggestions }
		else
			return [];

	}

	/**
	 * Completition provider for DCS language	 
	 * 
	 * @returns {array} array of completition
	 */
	 getDCSCompletition() {

		let suggestions = this.getCustomSuggestions(true);
		
		if (!suggestions.length && !window.editor.disableNativeSuggestions) {

			if (!this.requireQueryValue()) {

				if (this.lastOperator != '"') {
					this.getFillSuggestionsFromArray(suggestions, languages.bsl.languageDef.rules.DCSExp, monaco.languages.CompletionItemKind.Module, false);
					let functions = this.getQueryFunctions(window.bslDCS);
					this.getCommonCompletition(suggestions, functions, monaco.languages.CompletionItemKind.Function, true);
					this.getCustomObjectsCompletition(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
					this.getRefCompletition(suggestions);
					this.getSnippets(suggestions, window.DCSSnippets);
				}

			}
			else {
				
				this.getQueryValuesCompletition(suggestions, window.bslQuery.values, monaco.languages.CompletionItemKind.Enum);

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
							activeParameter: this.textBeforePosition.split(',').length - 1,
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
				regex = new RegExp(exp + '\\s?=\\s?(.*)\\(.*\\);', 'gi');
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
																activeParameter: this.textBeforePosition.split(',').length - 1,
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

						if (value.hasOwnProperty('methods')) {

							for (const [mkey, mvalue] of Object.entries(value.methods)) {

								if (mvalue[this.nameField].toLowerCase() == metadataFunc) {
									let signatures = this.getMethodsSignature(mvalue);
									if (signatures.length) {
										helper = {
											activeParameter: this.textBeforePosition.split(',').length - 1,
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
							activeParameter: this.textBeforePosition.split(',').length - 1,
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
	 * Fills array of completition for window.snippets	 
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 */
	getSnippets(suggestions, data) {

		if (this.word) {

			for (const [key, value] of Object.entries(data)) {

				if (key.toLowerCase().startsWith(this.word)) {

					suggestions.push({
						label: value.prefix,
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: value.body,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						detail: key,
						documentation: value.body
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
			
			for (const [key, value] of Object.entries(window.customSignatures)) {			
		
				if (key.toLowerCase() == word && value) {

					let activeSignature = context && context.activeSignatureHelp ? context.activeSignatureHelp.activeSignature : 0;
					
					helper = {
						activeParameter: this.textBeforePosition.split(',').length - 1,
						activeSignature: activeSignature,
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

		let match = this.model.findPreviousMatch('(', this.position, false);
		
		if (match) {

			const position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = this.lineNumber) {

				let lineContextData = window.contextData.get(position.lineNumber)
				let wordContext = null;

				if (lineContextData) {
					
					let wordUntil = this.model.getWordUntilPosition(position);
					wordContext = lineContextData.get(wordUntil.word.toLowerCase());
				
					if (wordContext && wordContext.sig) {
												
						helper = {
							activeParameter: this.textBeforePosition.split(',').length - 1,
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

			if (!window.editor.disableNativeSignatures) {

				if (!helper)
					helper = this.getRefSigHelp();

				if (!helper)
					helper = this.getMetadataSigHelp(window.bslMetadata);

				if (!helper)
					helper = this.getClassSigHelp(window.bslGlobals.classes);

				if (!helper)
					helper = this.getCommonSigHelp(window.bslGlobals.globalfunctions);

				if (!helper)
					helper = this.getCommonSigHelp(window.bslGlobals.customFunctions);

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
	getQuerySigHelp(context) {
		
		let unclosed = this.unclosedString(this.textBeforePosition);

		if (this.lastOperator != ')' && !this.requireQueryValue() && 0 <= unclosed.index) {
			
			let helper = this.getCustomSigHelp(context);

			if (!helper && !window.editor.disableNativeSignatures) {
				let functions = this.getQueryFunctions(window.bslQuery);
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

			if (!helper && !window.editor.disableNativeSignatures) {

				let functions = this.getQueryFunctions(window.bslDCS);
				helper = this.getCommonSigHelp(functions);

				if (!helper) {
					functions = this.getQueryFunctions(window.bslQuery);
					helper = this.getCommonSigHelp(functions);
				}

			}

			if (helper)
				return new SignatureHelpResult(helper);

		}

	}

	/**
	 * Updates window.bslMetadata from JSON-string which
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

				if (this.objectHasPropertiesFromArray(window.bslMetadata, path.split('.'))) {
					this.setObjectProperty(window.bslMetadata, path, metadataObj);
					return true;
				}
				else {
					throw new TypeError("Wrong path");
				}

			}
			else {

				if (metadataObj.hasOwnProperty('catalogs') || metadataObj.hasOwnProperty('customObjects')) {
					for (const [key, value] of Object.entries(metadataObj)) {
						window.bslMetadata[key].items = value;
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
	 * Updates window.snippets from JSON-string which
	 * was received from 1C
	 * 
	 * @param {string} data JSON-string with window.snippets info
	 * @param {boolean} replace whether or not to replace native snippents
	 * 
	 * @returns {true|object} true - window.snippets was updated, {errorDescription} - not
	 */
	static updateSnippets(data, replace) {

		try {			
			let snippetsObj = JSON.parse(this.escapeJSON(data));
			if (snippetsObj.hasOwnProperty('snippets')) {
				if (replace) {
					window.snippets = snippetsObj.snippets;
				}
				else {
					for (const [key, value] of Object.entries(snippetsObj.snippets)) {
						window.snippets[key] = value;
					}
				}
				return true;
			}
			else {
				throw new TypeError("Wrong structure of window.snippets");
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
				window.bslGlobals.customFunctions = funcObj.customFunctions;
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
	static getRangesForConstruction(model, startString, endString) {
		
		let ranges = [];
		
		const startMatches = Finder.findMatches(model, '(?:^|\\b)?(' + startString + ') ');
		let startMatch = null;

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
		ranges = ranges.concat(this.getRangesForRegexp(model, "(?:^|\\b)#.+(?:.|\\n|\\r)*?#.+$"));
		ranges = ranges.concat(this.getRangesForConstruction(model, "пока|while", "конеццикла|enddo"));
		ranges = ranges.concat(this.getRangesForConstruction(model, "для .*(?:по|из) .*|for .* (?:to|each) .*", "конеццикла|enddo"));
		ranges = ranges.concat(this.getRangesForConstruction(model, "если|if", "конецесли|endif"));
		
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
		const matches = model.findMatches('(?:выбрать|select)[\\w\\s\u0410-\u044F&<>=*+-./,()]+', false, true, false, null, true);
				
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
	static getRangesForNesteBlock(model, regexp) {

		let ranges = [];		
		let match = null;
		const matches = model.findMatches(regexp, false, true, false, null, true);		
				
    	if (matches) {
			
			let last_line = window.editor.getModel().getLineCount();

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

		let pat_idx = 0;

		if (scopes) {

			let scope_idx = 0;

			while (scope_idx < scopes.length) {
				let scope = scopes[scope_idx];
				matches = matches.concat(model.findMatches(regexp, new monaco.Range(scope.start, 1, scope.end + 1, 1), true, false, null, true));
				scope_idx++;
			}

		}
		else {
			matches = model.findMatches(regexp, false, true, false, null, true);
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

		let nestedQueries = this.getRangesForNesteBlock(model, '\\((?:\\s|\\r)*(?:выбрать|select)');

		ranges = this.getRangesForQuery(model);				
		ranges = ranges.concat(nestedQueries);
		ranges = ranges.concat(this.getRangesForQueryBlock(model, '(?:выбрать|select)\\s+(?:(?:.|\\n|\\r)*?)\\n(?:\s|\t)*(?:из|from|поместить|into)', false, false, false));	
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
		ranges = ranges.concat(this.getRangesForNesteBlock(model, '(?:сумма|максимум|минимум|sum|min|max)\\s*\\('));
				
		return ranges;

	}

	/**
	 * Provider for custom hover popoup
	 * 
	 * @returns {object} - hover object or null
	 */
	getCustomHover() {

		for (const [key, value] of Object.entries(window.customHovers)) {			
			
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

		if (!hover && !window.editor.disableNativeHovers) {

			for (const [key, value] of Object.entries(window.bslGlobals)) {

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

		const regexp = RegExp('(".*(?:\\n(?:\\t|\\s)*\\|.*)+")', 'gi');

		let match = null;
		let queryFound = false;
		let code = this.model.getValue();
		let text = '';
		let range = null;

		while ((match = regexp.exec(code)) !== null && !queryFound) {

			text = match[match.length - 1];
			let start_position = this.model.getPositionAt(match.index);
			let end_position = this.model.getPositionAt(match.index + text.length);
			queryFound = (start_position.lineNumber <= this.lineNumber && this.lineNumber <= end_position.lineNumber);

			if (queryFound)
				range = new monaco.Range(start_position.lineNumber, start_position.column, end_position.lineNumber, end_position.column);

		}

		return queryFound ? { text: text, range: range } : null;

	}

	/**
	 * Returns format string's text from current position
	 * 
	 * @returns {object} object with text and range or null
	 */
	getFormatString() {

		const regexp = RegExp('"(.+)?"', 'gi');

		let match = null;
		let stringFound = false;
		let code = this.model.getValue();
		let text = '';
		let range = null;

		while ((match = regexp.exec(code)) !== null && !stringFound) {

			text = match[0];
			let start_position = this.model.getPositionAt(match.index);
			let end_position = this.model.getPositionAt(match.index + text.length);

			stringFound = (
				start_position.lineNumber == this.lineNumber
				&& this.lineNumber == end_position.lineNumber
				&& start_position.column <= this.column
				&& this.column <= end_position.column
			);

			if (stringFound)
				range = new monaco.Range(start_position.lineNumber, start_position.column, end_position.lineNumber, end_position.column);

		}

		return stringFound ? { text: text, range: range } : null;

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

		let selection = window.editor.getSelection();
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
			window.editor.setSelection(new monaco.Range(selection.startLineNumber, 1, maxLine, this.model.getLineMaxColumn(maxLine)));

	}

	/**
	 * Removes prefix from every selected lines
	 * 
	 * @param {string} prefix
	 * 
	 */
	removePrefix(prefix) {

		let selection = window.editor.getSelection();
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
			window.editor.setSelection(new monaco.Range(selection.startLineNumber, 1, maxLine, this.model.getLineMaxColumn(maxLine)));

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
		
		let insertRange = range ? range : monaco.Range.fromPositions(window.editor.getPosition());
		let startColumn = insertRange.startColumn;		

		if (usePadding && 1 < startColumn) {
			// Replacing tab to whitespaces for calculation number of appended tabs/whitespaces
			let tabSize = window.editor.getModel().getOptions().tabSize;
			let valueBefore =  window.editor.getModel().getValueInRange(
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
			window.editor.executeEdits(txt, [operation]);
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

		const regexp = RegExp(string, 'gi');
		const match = regexp.exec(this.model.getValue());
		
		if (match !== null && match.length)  {
			let position = this.model.getPositionAt(match.index);
			lineNumber =  position.lineNumber;
		}

		return lineNumber;

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
			'если', 'для', 'пока', 'функция', 'процедура', 'попытка',
			'if', 'for', 'while', 'function', 'procedure', 'try'			
		];

		const stopWords = [
			'конецесли', 'конеццикла', 'конецфункции', 'конецпроцедуры', 'конецпопытки',
			'endif', 'enddo', 'endfunction', 'endprocedure', 'endtry'
		];

		const complexWords = [
			'исключение', 'иначе', 'иначеесли',
			'except', 'else', 'elseif'
		];

		const strings = model.getValue().split('\n');

		let offset = 0;

		strings.forEach(function (str, index) {

			let original = str;
			let comment = str.indexOf('//');

			if (0 <= comment)
				str = str.substr(0, comment);			

			let semi = str.indexOf(';');

			if (0 <= semi)
				str = str.substr(0, semi);			

			let words = str.trim().split(' ');
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

		return result;
	}

	/**
	 * Handler of hoverProvider
	 * for EVENT_BEFORE_HOVER generation
	 */
	onProvideHover() {

		if (window.generateBeforeHoverEvent) {
			let token = this.getLastToken();
			let params = {
				word: this.model.getWordAtPosition(this.position),
				token: token,
				line: this.lineNumber,
				column: this.column,
				altKey: window.altPressed,
				ctrlKey: window.ctrlPressed,
				shiftKey: window.shiftPressed
			}
			window.sendEvent('EVENT_BEFORE_HOVER', params);
		}

	}

	/**
	 * Handler of completionProvider
	 * for EVENT_BEFORE_SHOW_SUGGEST generation
	 * @param {CompletionContext} context 
	 * @param {object} list of completition 
	 */
	onProvideCompletion(context, completition) {

		if (window.generateBeforeShowSuggestEvent) {                			
			
			let rows = [];
			if (Object.keys(completition).length) {
				for (const [key, value] of Object.entries(completition.suggestions)) {
					rows.push(value.label);
				}                        
			}

			let trigger = context.triggerCharacter;
			
			if (!trigger) {
				switch (window.editor.lastKeyCode) {
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

			genarateEventWithSuggestData('EVENT_BEFORE_SHOW_SUGGEST', trigger, null, rows);
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

			if (0 <= word.indexOf('web') && window.colors.hasOwnProperty('WebColors')) {

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

}

export default bslHelper;