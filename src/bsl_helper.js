
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
		
		this.nameField = engLang ? 'name_en': 'name';
		this.queryNameField = engLang ? 'query_name_en' : 'query_name';

	}

	/**
	 * Check if string has russian characters
	 * @param {string} text string for analisis
	 */
	hasRu(text) {

		return /[\u0410-\u044F]+/.test(text);

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
			
			position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);
			match = this.model.findPreviousMatch('[a-zA-Z0-9\u0410-\u044F]+', position, true, false, null, true);

			if (match) {
				
				let range = new monaco.Range(match.range.startLineNumber, match.range.startColumn - 1, match.range.startLineNumber, match.range.startColumn);
				let prevChar = this.getLastCharacter(range);

				if (prevChar == '.') {
					position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);
					return this.getLastSeparatedWord(position);
				}
				else
					word = match.matches[0];				

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

		let word = this.getLastSeparatedWord().toLowerCase();
		return (word == 'ссылка' || word == 'refs') && (this.lastOperator == '');

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

			for (const [key, value] of Object.entries(data)) {
				
				let values = [];				

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

					if ( (key != 'ru' && key != 'en') || (key == 'ru' && !engLang) || (key == 'en' && engLang)) {

						for (const [inkey, invalue] of Object.entries(value)) {
							let postfix = '';
							if (invalue.hasOwnProperty('postfix'))
								postfix = invalue.postfix;
							values.push({ name: inkey, detail: '', description: '', postfix: postfix, template: '', command: null });
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
				})
			}
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

					if (queryMode) {
						if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, 'properties')) {
							this.fillSuggestionsForMetadataItem(suggestions, bslMetadata[itemName].items[subItemName]);
						}
					}
					else {
						if (itemName == 'classes' || itemName == 'types') {
							if (this.objectHasProperties(bslGlobals, itemName, subItemName)) {
								this.getClassSuggestions(suggestions, bslGlobals[itemName][subItemName]);
							}
						}
						else {

							let methodsName = (refArray.length == 3 && refArray[2] == 'obj') ? 'objMethods' : 'refMethods'

							if (this.objectHasProperties(bslMetadata, itemName, 'items', subItemName, 'properties')) {
								this.fillSuggestionsForMetadataItem(suggestions, bslMetadata[itemName].items[subItemName]);
								this.getMetadataMethods(suggestions, bslMetadata[itemName], methodsName, itemName, subItemName);
							}

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
	getRefCompletition(suggestions) {
		
		let match = this.model.findPreviousMatch('.', this.position, false);
		
		if (match) {

			let position = new monaco.Position(match.range.startLineNumber, match.range.startColumn);

			if (position.lineNumber = this.lineNumber) {

				let lineContextData = contextData.get(position.lineNumber)

				if (lineContextData) {

					let wordUntil = this.model.getWordUntilPosition(position);
					if (wordUntil.word)
						this.getRefSuggestions(suggestions, lineContextData.get(wordUntil.word.toLowerCase()))
					else if (this.lastOperator == ')')
						this.getRefSuggestions(suggestions, lineContextData.get(this.lastRawExpression))
					
				}

				if (!suggestions.length) {
					
					// 1C does not support positive/negative lookbehind yet
					//match = this.model.findPreviousMatch('(?<!\\/\\/.*)' + this.lastRawExpression + '\\s?=\\s?.*\\.([^.]*?)\\s?(?:;|\\()', this.position, true, false, null, true);
					
					// This also does not work inside 1C
					/*
					match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?.*\\.([^.]*?)\\s?(?:;|\\()', this.position, true, false, null, true);
					if (!match)
						match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?([a-zA-Z0-9\u0410-\u044F_]+)\\(', this.position, true, false, null, true);
					*/
					
					// So we have to use 2 rexep to detect last function`s (field`s) reference
					match = this.model.findPreviousMatch(this.lastRawExpression + '\\s?=\\s?.*', this.position, true, false, null, true);					
			
					if (match) {

						position = new monaco.Position(match.range.endLineNumber, match.range.endColumn);

						match = this.model.findPreviousMatch('\\.([^.]*?)\\s?(?:;|\\()', position, true, false, null, true);					

						if (!match)
							match = this.model.findPreviousMatch('([a-zA-Z0-9\u0410-\u044F_]+)\\(', position, true, false, null, true);

						if (match) {

							lineContextData = contextData.get(match.range.startLineNumber);

							if (lineContextData) 
								this.getRefSuggestions(suggestions, lineContextData.get(match.matches[match.matches.length - 1].toLowerCase()));
								
						}

					}
				}
			}

		}		
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

		if (objName) {

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
									
						suggestions.push({
							label: ikey,
							kind: kind,
							insertText: ikey,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet							
						});
					}
					
				}

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
	 * Fills array of completition for class methods, properties and
	 * system enumarations
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary
	 */
	getClassCompletition(suggestions, data) {

		let classExists = false;
		let className = '';
		let exp = this.lastRawExpression;

		if (exp) {

			// 1C does not support positive/negative lookbehind yet
			// const match = this.model.findPreviousMatch('(?<!\\/\\/.*)' + exp + '\\s?=\\s?(?:new|новый)\\s+(.*?)(?:\\(|;)', this.position, true, false, null, true);		
			const match = this.model.findPreviousMatch(exp + '\\s?=\\s?(?:new|новый)\\s+(.*?)(?:\\(|;)', this.position, true, false, null, true);

			if (match) {						
				className = match.matches[match.matches.length - 1].toLowerCase();
			}
			else {			
				className = exp;
			}
			
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

		if (obj.hasOwnProperty('properties')) {

			for (const [pkey, pvalue] of Object.entries(obj.properties)) {
				
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

					for (const [key, value] of Object.entries(data)) {

						if (value.hasOwnProperty(this.nameField)) {

							if (value[this.nameField].toLowerCase() == metadataName) {

								for (const [ikey, ivalue] of Object.entries(value.items)) {

									if (ikey.toLowerCase() == metadataItem) {

										let methodDef = this.getMetadataMethodByName(value, metadataFunc);
										let methodsName = (methodDef && methodDef.hasOwnProperty('ref') && methodDef.ref.indexOf(':obj') != -1) ? 'objMethods' : 'refMethods';

										itemExists = true;
										this.fillSuggestionsForMetadataItem(suggestions, ivalue);
										this.getMetadataMethods(suggestions, value, methodsName, key, ikey);
									}

								}

							}

						}

					}

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

							if (itemNode.hasOwnProperty('predefined')) {

								for (const [pkey, pvalue] of Object.entries(itemNode.predefined)) {
															
									values.push({
										name: pkey,
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

						values.forEach(function (value) {

							suggestions.push({
								label: value.name,
								kind: value.kind,
								insertText: value.name + value.postfix,
								insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
								detail: value.detail,
								documentation: value.description
							});

						});

					}
				}

			}

		}

		if (!metadataExists)
			metadataExists = this.getMetadataItemCompletition(suggestions, data);

		return metadataExists;

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

					if (value.hasOwnProperty('ref') && bslMetadata.hasOwnProperty(value.ref) && bslMetadata[value.ref].hasOwnProperty('items')) {

						for (const [mkey, mvalue] of Object.entries(bslMetadata[value.ref].items)) {

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
	 * Fills and returns array of variables names
	 * 
	 * @param {int} currentLine the last line below which we don't search variables
	 * 
	 * @returns {array} array with variables names
	 */
	getVarsNames(currentLine) {

		let names = [];
		let comments = new Map();

		const commentMatches = this.model.findMatches('\\/\\/', true, true, false, null, true);

		for (let idx = 0; idx < commentMatches.length; idx++) {
			comments.set(commentMatches[idx].range.startLineNumber, commentMatches[idx].range.startColumn);
		}

		let matches = this.model.findMatches('([a-zA-Z0-9\u0410-\u044F_]+)\\s?=\\s?.*(?:;|\\()\\s*$', true, true, false, null, true);

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
		
		matches = [];
		let funcDef = [];
		let funcLine = 0;

		if (currentLine == 0)
			matches = editor.getModel().findMatches('(?:процедура|функция)\\s+[a-zA-Z0-9\u0410-\u044F_]+\\(([a-zA-Z0-9\u0410-\u044F_,\\s=]+)\\)', true, true, false, null, true);					
		else {
			funcDef = editor.getModel().findPreviousMatch('(?:процедура|функция)\\s+[a-zA-Z0-9\u0410-\u044F_]+\\(([a-zA-Z0-9\u0410-\u044F_,\\s=]+)\\)', true, true, false, null, true);
			if (funcDef) {
				funcLine = funcDef.range.startLineNumber;
				matches.push(funcDef);
			}			
		}

		for (let idx = 0; idx < matches.length; idx++) {
		
			let match = matches[idx];
			let params = match.matches[1].split(',');
			
			params.forEach(function(param) {
				let paramName = param.split('=')[0].trim();
				if (!names.some(name => name === paramName))
					names.push(paramName);
			});

		}
				
		matches = editor.getModel().findMatches('(?:перем|var)\\s+([a-zA-Z0-9\u0410-\u044F_,\\s]+);', true, true, false, null, true);

		for (let idx = 0; idx < matches.length; idx++) {

			let match = matches[idx];
			
			if (currentLine == 0 || funcLine < match.range.startLineNumber) {

				let varDef = match.matches[match.matches.length - 1];

				const params = varDef.split(',');
			
				params.forEach(function(param) {
					let paramName = param.split('=')[0].trim();
					if (!names.some(name => name === paramName))
						names.push(paramName);
				});

			}

		}
				
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
	 * Completition provider
	 * 
	 * @returns {array} array of completition
	 */
	getCompletition() {

		let suggestions = [];

		if (!this.requireType()) {

			if (this.lastOperator != '"') {

				this.getRefCompletition(suggestions);

				if (!suggestions.length) {

					if (!this.getClassCompletition(suggestions, bslGlobals.classes)) {

						if (!this.getClassCompletition(suggestions, bslGlobals.systemEnum)) {

							if (!this.getMetadataCompletition(suggestions, bslMetadata)) {

								if (!suggestions.length)
									this.getVariablesCompetition(suggestions);

								if (engLang)
									this.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);
								else
									this.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword, true);

								if (this.requireClass()) {
									this.getCommonCompletition(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor, false);
								}
								else {
									this.getCommonCompletition(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function, true);
									this.getCommonCompletition(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class, false);
									this.getCommonCompletition(suggestions, bslGlobals.systemEnum, monaco.languages.CompletionItemKind.Enum, false);
									this.getCommonCompletition(suggestions, bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function, true);
									this.getCommonCompletition(suggestions, bslMetadata.commonModules, monaco.languages.CompletionItemKind.Module, true);
									this.getCustomObjectsCompletition(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
								}

								this.getSnippets(suggestions, snippets);

							}

						}

					}
				}

			}

		}
		else {
			this.getTypesCompletition(suggestions, bslGlobals.types, monaco.languages.CompletionItemKind.Enum);
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
													label:  pkey,
													kind: kind,
													insertText: pkey + ')',
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,											
												});
											}
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

				}

			}

		}

	}

	/**
	 * Fills array of completition for query language`s keywords
	 * and expressions
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} langDef query language definition
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryCommonCompletition(suggestions, langDef, kind) {	

		let word = this.word;

		if (word) {

			let values = []

			for (const [key, keyword] of Object.entries(langDef.rules.keywords)) {
				values.push(keyword);
			}

			for (const [key, keyword] of Object.entries(langDef.rules.expressions)) {
				values.push(keyword);
			}

			values.forEach(function (value) {

				if (value.toLowerCase().startsWith(word)) {

					let expression = value.toUpperCase();

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
	 * Fills array of completition for params of query
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 * @param {CompletionItemKind} kind - monaco.languages.CompletionItemKind (class, function, constructor etc.)
	 */
	getQueryParamsCompletition(suggestions, kind) {	

		if (this.lastRawExpression.startsWith('&')) {
		
			const matches = this.model.findMatches('&(.*?)[\\s\\n,]', true, true, false, null, true)

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

			for (const [key, value] of Object.entries(bslMetadata)) {
				
				if (value.hasOwnProperty(this.queryNameField) && value[this.queryNameField].toLowerCase() == metadataType) {
				
					for (const [ikey, ivalue] of Object.entries(value.items)) {

						if (ikey.toLowerCase() == metadataName) {
							this.fillSuggestionsForMetadataItem(suggestions, ivalue);
						}

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

						}

					}					

				}

			}

		}
		
	}

	/**
	 * Fills array of completition for fields of querie's table
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 
	 */
	getQueryFieldsCompletition(suggestions) {

		if (this.getLastCharacter() == '.') {
			
			// Let's find start of current query
			let match = this.model.findPreviousMatch('(?:выбрать|select)', this.position, true);
			
			if (match) {
				
				// Now we need to find lastExpression definition
				let position =  new monaco.Position(match.range.startLineNumber, match.range.startColumn);
				match = this.model.findNextMatch('(.*)\\s+(?:как|as)\\s+' + this.lastRawExpression, position, true, false, null, true);
				
				if (match) {					
					let sourceDefinition = match.matches[1];
					sourceDefinition = sourceDefinition.replace(/(из|левое|правое|внутреннее|внешнее|полное|from|left|right|inner|outer|full)?\s?(соединение|join)?/gi, '').trim();

					if (!this.getQueryFieldsCompletitionForMetadata(suggestions, sourceDefinition)) {
						this.getQueryFieldsCompletitionForTempTable(suggestions, sourceDefinition, position);
					}

				}

			}
			
		}

	}

	/**
	 * Returns temporary tables of register depending on the register's type
	 * 
	 * @param {string} type of register like balance, turnovers, periodical
	 *	 
	 * @returns {array} array of names
	 */
	getRegisterTempraryTables(type) {

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

		}

		return tables;

	}

	/**
	 * Fills array of completition for temporary tables of registers in source
	 * 
	 * @param {object} data objects from BSL-JSON dictionary
	 * @param {string} metadataItem name of metadata item like (ЦеныНоменклатуры/ProductPrices, СвободныеОстатки/AvailableStock)
	 * @param {array} suggestions array of suggestions for provideCompletionItems	 	 
	 */
	getQuerySourceMetadataRegTempraryTablesCompletition(data, metadataItem, suggestions) {

		for (const [ikey, ivalue] of Object.entries(data.items)) {

			if (ikey.toLowerCase() == metadataItem.toLowerCase() && ivalue.hasOwnProperty('type')) {

				let tables = this.getRegisterTempraryTables(ivalue.type);

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

		for (const [key, value] of Object.entries(bslMetadata)) {

			if (value.hasOwnProperty(this.queryNameField) && value[this.queryNameField].toLowerCase() == metadataName.toLowerCase()) {

				sourceExist = true;

				if (!metadataItem) {

					for (const [ikey, ivalue] of Object.entries(value.items)) {

						let label = ikey;

						suggestions.push({
							label: ikey,
							kind: kind,
							insertText: label,
							insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
						});

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

			let matches = editor.getModel().findMatches('(?:поместить|into)\\s+([a-zA-Z0-9\u0410-\u044F_]+)', null, true, false, null, true);

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
		
		if (this.getLastCharacter() != '.') {

			// Let's find start of current query
			let startMatch = this.model.findPreviousMatch('(?:выбрать|select)', this.position, true);

			if (startMatch) {

				let template = '(?:из|from)\\s+(?:(?:.|\\n|\\r)*?)\\s*(?:\\s|\\t)*(?:сгруппировать|объединить|упорядочить|имеющие|где|индексировать|havin|where|index|group|union|order|;)'
				let position = new monaco.Position(startMatch.range.startLineNumber, startMatch.range.startColumn);
				let fromMatch = this.model.findNextMatch(template, position, true);

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
	 * Completition provider for query language
	 * 
	 * @param {object} langDef - query language definition
	 * 
	 * @returns {array} array of completition
	 */
	getQueryCompletition(langDef) {

		let suggestions = [];

		if (!this.requireQueryValue()) {

			if (!this.requireQueryRef()) {

				if (!this.getQuerySourceCompletition(suggestions, monaco.languages.CompletionItemKind.Enum)) {

					if (this.lastOperator != '"') {
						this.getCommonCompletition(suggestions, bslQuery.functions, monaco.languages.CompletionItemKind.Function, true);
						this.getRefCompletition(suggestions);
						this.getQueryTablesCompletition(suggestions, monaco.languages.CompletionItemKind.Class);
					}

					this.getQueryCommonCompletition(suggestions, langDef, monaco.languages.CompletionItemKind.Module);					
					this.getQueryParamsCompletition(suggestions, monaco.languages.CompletionItemKind.Enum);				
					this.getQueryFieldsCompletition(suggestions);
					this.getSnippets(suggestions, querySnippets);

				}

			}
			else {
				
				this.getQueryRefCompletition(suggestions, monaco.languages.CompletionItemKind.Enum);

			}

		}
		else {
			
			this.getQueryValuesCompletition(suggestions, bslQuery.values, monaco.languages.CompletionItemKind.Enum);

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

					let signature = {
						label: svalue.СтрокаПараметров,
						parameters: []
					}

					for (const [pkey, pvalue] of Object.entries(svalue.Параметры)) {
						signature.parameters.push({
							label: pkey,
							documentation: pvalue
						});
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

					let signature = {
						label: cvalue.signature,
						documentation: cvalue.hasOwnProperty('description') ? cvalue.description : '',
						parameters: []
					}

					if (cvalue.hasOwnProperty('params')) {

						for (const [pkey, pvalue] of Object.entries(cvalue.params)) {
							signature.parameters.push({
								label: pkey,
								documentation: pvalue
							});
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
	 * @returns {object} helper with signatures
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
	 * @returns {object} helper with signatures
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
	 * @returns {object} helper with signatures
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
	 * @returns {object} helper with signatures
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
	 * Fills array of completition for snippets	 
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
	 * Fills signatures provided for reference-type object
	 * if a reference was found in the previous position
	 * 
	 * @param {aaray} suggestions the list of suggestions
	 */
	getRefSigHelp() {
		
		let helper = null;

		let match = this.model.findPreviousMatch('(', this.position, false);
		
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
	 * @returns {object} helper
	 */
	getSigHelp() {
		
		if (this.lastOperator != ')') {

			let helper = this.getRefSigHelp();

			if (!helper)
				helper = this.getMetadataSigHelp(bslMetadata);

			if (!helper)
				helper = this.getClassSigHelp(bslGlobals.classes);

			if (!helper)
				helper = this.getCommonSigHelp(bslGlobals.globalfunctions);

			if (!helper)
				helper = this.getCommonSigHelp(bslGlobals.customFunctions);

			if (helper)
				return new SignatureHelpResult(helper);

		}

	}

	/**
	 * Signature help provider for query language
	 * 
	 * @returns {object} helper
	 */
	getQuerySigHelp() {
		
		if (this.lastOperator != ')' && !this.requireQueryValue()) {
			
			let helper = this.getCommonSigHelp(bslQuery.functions);
			
			if (helper)
				return new SignatureHelpResult(helper);

		}

	}

	/**
	 * Updates bslMetadata from JSON-string which
	 * was received from 1C
	 * 
	 * @param {string} metadata JSON-string with metadata info
	 * 
	 * @returns {true|object} true - metadata was updated, {errorDescription} - not
	 */
	static updateMetadata(metadata) {

		try {
			let metadataObj = JSON.parse(metadata);
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
	static getRangesForConstruction(model, startString, endString) {
		
		let ranges = [];
		
		const startMatches = model.findMatches("(?:^|\\b)?(" + startString + ") ", false, true)	
		let startMatch = null;

		const endMatches =  model.findMatches("(?:^|\\b)?(" + endString + ") ?;", false, true)	
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
		const matches = model.findMatches(regexp, false, true, false, null, true)
    	
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
	 * Provider for hover popoup
	 * 
	 * @returns {object} - hover object or null
	 */
	getHover() {

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
		
		for (const [key, value] of Object.entries(customHovers)) {			
			
			if (key.toLowerCase() == this.word && value) {
									
				return {
					range: new monaco.Range(this.lineNumber, this.column, this.lineNumber, this.model.getLineMaxColumn(this.lineNumber)),
					contents: [							
						{ value: value }
					]
				};				

			}

		}		

		return null;

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

		const matches = this.model.findMatches('"(.+)?"', false, true, false, null, true)

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
			if (editor.getModel().getLineContent(line).trim() && !(line == selection.endLineNumber && this.column == 1 && this.lineNumber == line) || oneLine) {
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
		
		let insertRange = range ? range : monaco.Range.fromPositions(editor.getPosition());
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

}