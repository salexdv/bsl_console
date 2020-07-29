
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

					let template = value.hasOwnProperty('template') ? value.template : '';

					values.push({ name: value[this.nameField], detail: value.description, description: value.hasOwnProperty('returns') ? value.returns : '', postfix: postfix, template: template });					

				}
				else {

					if ( (key != 'ru' && key != 'en') || (key == 'ru' && !engLang) || (key == 'en' && engLang)) {

						for (const [inkey, invalue] of Object.entries(value)) {
							let postfix = '';
							if (invalue.hasOwnProperty('postfix'))
								postfix = invalue.postfix;
							values.push({ name: inkey, detail: '', description: '', postfix: postfix, template: '' });
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
							documentation: value.description
						});
					}
				})
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

					if (value.hasOwnProperty('properties')) {

						for (const [pkey, pvalue] of Object.entries(value.properties)) {
							
							values.push({
								name: pvalue[this.nameField],
								detail: pvalue.description,
								description: '',
								postfix: '',
								kind: monaco.languages.CompletionItemKind.Field
							});

						}

					}

					if (value.hasOwnProperty('values')) {

						for (const [vkey, vvalue] of Object.entries(value.values)) {
							
							values.push({
								name: vvalue[this.nameField],
								detail: vvalue.description,
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
		let exp = this.getLastRawExpression();

		let fullText = this.getFullTextBeforePosition();
		let regex = new RegExp(exp + '\\s?=\\s?(?:новый|new)\\s(.*)\\(.*\\);', 'gi');

		regex = regex.exec(fullText);
		
		if (regex && 1 < regex.length) {						
			className = regex[1];			
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

		return classExists;

	}

	/**
	 * Fills array of completition for metadata subitem	like catalog of products
	 * 
	 * @param {array} suggestions array of suggestions for provideCompletionItems
	 * @param {object} data objects from BSL-JSON dictionary	 
	 */
	getMetadataItemCompletition(suggestions, data) {

		let itemExists = false;

		let exp = this.getLastRawExpression();
		
		if (exp) {

			let fullText = this.getFullTextBeforePosition();
			let regex = new RegExp(exp + '\\s?=\\s?(.*)\\(.*\\);', 'gi');
			regex = regex.exec(fullText);
			
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

										itemExists = true;

										for (const [pkey, pvalue] of Object.entries(ivalue.properties)) {
											suggestions.push({
												label: pkey,
												kind: monaco.languages.CompletionItemKind.Field,
												insertText: pkey,
												insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
												detail: pvalue
											});
										}

										if (value.hasOwnProperty('objMethods')) {

											let postfix = '';
											let signatures = [];

											for (const [mkey, mvalue] of Object.entries(value.objMethods)) {

												signatures = this.getMethodsSignature(mvalue);
												if (signatures.length == 0 || (signatures.length == 1 && signatures[0].parameters.length == 0))
													postfix = '()';
												
												suggestions.push({
													label: mvalue[this.nameField],
													kind: monaco.languages.CompletionItemKind.Function,
													insertText: mvalue.name + postfix,
													insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
													detail: mvalue.description
												});

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

								for (const [pkey, pvalue] of Object.entries(itemNode.properties)) {
									suggestions.push({
										label: pkey,
										kind: monaco.languages.CompletionItemKind.Field,
										insertText: pkey,
										insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
										detail: pvalue
									});
								}

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

			for (const [inkey, invalue] of Object.entries(value)) {

				if (!subType) {

					let suggestion = {
						label: inkey,
						kind: kind,
						insertText: inkey,
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
					}

					if (invalue.hasOwnProperty('ref')) {
						suggestion.insertText += '.';
						suggestion['command'] = { id: 'editor.action.triggerSuggest', title: 'suggest_type' };
					}
					else {
						suggestion.insertText += '"';
					}

					suggestions.push(suggestion);

				}
				else {

					if (inkey.toLowerCase() == subType) {

						if (invalue.hasOwnProperty('ref') && bslMetadata.hasOwnProperty(invalue.ref) && bslMetadata[invalue.ref].hasOwnProperty('items')) {

							for (const [mkey, mvalue] of Object.entries(bslMetadata[invalue.ref].items)) {

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

				if (!this.getClassCompletition(suggestions, bslGlobals.classes)) {

					if (!this.getClassCompletition(suggestions, bslGlobals.systemEnum)) {

						if (!this.getMetadataCompletition(suggestions, bslMetadata)) {

							this.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword.ru, true);
							this.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword.en, true);

							if (this.requireClass()) {
								this.getCommonCompletition(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor, false);
							}
							else {
								this.getCommonCompletition(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function, true);
								this.getCommonCompletition(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class, false);
								this.getCommonCompletition(suggestions, bslGlobals.systemEnum, monaco.languages.CompletionItemKind.Enum, false);
								this.getCommonCompletition(suggestions, bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function, true);
								this.getCommonCompletition(suggestions, bslMetadata.commonModules, monaco.languages.CompletionItemKind.Module, true);
							}

							this.getSnippets(suggestions, snippets);

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
	 * Signature help provider
	 * 
	 * @returns {object} helper
	 */
	getSigHelp() {
		
		if (this.lastOperator != ')') {

			let helper = this.getMetadataSigHelp(bslMetadata);

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
			if (metadataObj.hasOwnProperty('catalogs')) {
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

		const matches = this.model.findMatches("\"(.*?)\"", false, true, false, null, true)

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
	 * Add comment for every selected lines
	 */
	addComment() {

		let selection = editor.getSelection();
		let minColumn = this.getMinColumn(selection);

		for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
			this.setText(
				'//' +
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
					endColumn: this.model.getLineMaxColumn(line) + 2
				},
				false
			)
		}		

	}

	/**
	 * Removes comment from every selected lines
	 */
	removeComment() {

		let selection = editor.getSelection();		

		for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
			
			let firsColumn = this.model.getLineFirstNonWhitespaceColumn(line);
			let startChars = this.model.getValueInRange({
				startLineNumber: line,
				startColumn: firsColumn,
				endLineNumber: line,
				endColumn: Math.min(firsColumn + 2, this.model.getLineMaxColumn(line))
			});

			if (startChars == '//') {
				this.setText(					
					this.model.getValueInRange({
						startLineNumber: line,
						startColumn: firsColumn + 2,
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
			}			
		}		

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

}