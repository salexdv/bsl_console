/**
 * Class for search into ITextModel 
 */
class Finder {

	constructor() {

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
	static findPreviousMatch(model, pattern, position, allowLooping = true) {

		const code = model.getValue();
		const offset = model.getOffsetAt(position);
		let match = null;
		let previous_match = null;
		let last_match = null;

		let regexp = RegExp(pattern, 'gmi');

		while ((match = regexp.exec(code)) !== null) {

			last_match = match;

			if (previous_match && match.index == previous_match.index || offset <= match.index)
				break
			else
				previous_match = match;

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
	 * Replacement for monaco's findNextMatch
	 * https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.itextmodel.html#findnextmatch
	 * because it does't work linux
	 * @param {ITextModel} model 
	 * @param {string} pattern to look for
	 * @param {IPosition} start position
	 * @param {bool} allow looping or not
	 * @returns 
	 */
	static findNextMatch(model, pattern, position, allowLooping = true) {

		const code = model.getValue();
		const offset = model.getOffsetAt(position);
		let match = null;
		let next_match = null;
		let first_match = null;

		let regexp = RegExp(pattern, 'gmi');

		while ((match = regexp.exec(code)) !== null && !next_match) {

			if (!first_match)
				first_match = match;

			if (match.index >= offset)
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
	 * Replacement for monaco's findMatches
	 * https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.itextmodel.html#findmatches
	 * because it does't work linux
	 * @param {ITextModel} model
	 * @param {string} pattern to look for
	 * @param {IRange} limit the searching to only search inside these range
	 * @returns 
	 */
	static findMatches(model, pattern, searchScope = null) {

		const code = model.getValue();
		let matches = [];
		let match = null;

		let regexp = RegExp(pattern, 'gmi');

		while ((match = regexp.exec(code)) !== null) {

			let text = match[0];
			let start_position = model.getPositionAt(match.index);
			let end_position = model.getPositionAt(match.index + text.length);
			let valid = true;

			if (searchScope != null) {
				valid = (searchScope.startLineNumber < start_position.lineNumber ||
					(searchScope.startLineNumber == start_position.lineNumber && searchScope.startColumn <= start_position.column));
					valid = Math.min(valid, (end_position.lineNumber < searchScope.endLineNumber ||
					(end_position.lineNumber == searchScope.endLineNumber && end_position.column <= searchScope.endColumn)));
			}

			if (valid) {
				matches.push({
					range: new monaco.Range(start_position.lineNumber, start_position.column, end_position.lineNumber, end_position.column),
					matches: match
				});
			}

		}

		return matches;

	}

}