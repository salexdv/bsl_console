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

		/*
		 * Размер проверяемого блока. Подобрано экспериментально: 128 КБ
		 * даёт ранний выход на первом же чанке с совпадением и не держит
		 * в памяти весь документ. На 5–10 МБ модулях 1С ускоряет поиск
		 * предыдущего вхождения с ~2 с до десятков мс.
		 */
		const chunkSize = 128 * 1024;

		/*
		 * Перекрытие справа от логического конца блока: чтобы не потерять
		 * совпадение, начавшееся в текущем чанке и заканчивающееся за его
		 * границей. Достаточно больше максимальной ожидаемой длины совпадения
		 * (паттерны в bsl_helper короткие/однострочные).
		 */
		const overlapSize = 4096;

		const offset = model.getOffsetAt(position);
		const textLength = model.getValueLength();

		/*
		 * Сохраняем флаги оригинального RegExp, если передан объект;
		 * для строкового паттерна используем gmi (как в оригинале).
		 * Старый WebKit поля 1С не поддерживает dotAll — добавляем 's'
		 * только если свойство уже выставлено.
		 */
		const source = pattern instanceof RegExp
			? pattern.source
			: String(pattern);

		let flags = 'gmi';

		if (pattern instanceof RegExp) {
			flags = 'g';

			if (pattern.ignoreCase)
				flags += 'i';

			if (pattern.multiline)
				flags += 'm';

			if (pattern.dotAll)
				flags += 's';
		}

		/*
		 * Поиск последнего совпадения в диапазоне [rangeStart, rangeEnd)
		 * с абсолютным ограничением maxMatchOffset: совпадения, начинающиеся
		 * на/после него, не учитываются (нужно для отсечения курсора и для
		 * фазы зацикливания).
		 */
		function searchRange(rangeStart, rangeEnd, maxMatchOffset) {

			const startPos = model.getPositionAt(rangeStart);
			const endPos = model.getPositionAt(rangeEnd);

			const value = model.getValueInRange({
				startLineNumber: startPos.lineNumber,
				startColumn: startPos.column,
				endLineNumber: endPos.lineNumber,
				endColumn: endPos.column
			});

			const regexp = new RegExp(source, flags);

			let match;
			let lastMatch = null;

			while ((match = regexp.exec(value)) !== null) {

				const absoluteIndex = rangeStart + match.index;

				if (absoluteIndex >= maxMatchOffset)
					break;

				lastMatch = {
					match: match,
					index: absoluteIndex
				};

				/*
				 * Защита от бесконечного цикла для выражений, способных
				 * совпасть с пустой строкой (повторяет поведение оригинала).
				 */
				if (match[0].length === 0) {
					regexp.lastIndex++;

					if (regexp.lastIndex > value.length)
						break;
				}
			}

			return lastMatch;
		}

		function makeResult(found) {

			if (!found)
				return null;

			const match = found.match;
			const startOffset = found.index;
			const endOffset = startOffset + match[0].length;

			const startPosition = model.getPositionAt(startOffset);
			const endPosition = model.getPositionAt(endOffset);

			/*
			 * match.index был относительным к блоку; колл-сайты читают
			 * matches[0], matches[1], а потенциально и matches.index —
			 * приводим к абсолютному оффсету, как в оригинале.
			 */
			match.index = startOffset;

			return {
				range: new monaco.Range(
					startPosition.lineNumber,
					startPosition.column,
					endPosition.lineNumber,
					endPosition.column
				),
				matches: match
			};
		}

		/*
		 * Идём от курсора к началу документа чанками; первый чанк с
		 * совпадением даёт результат (в нём уже лежит последнее совпадение
		 * перед курсором, т.к. scan шёл слева направо).
		 */
		let blockEnd = offset;

		while (blockEnd > 0) {

			const blockStart = Math.max(0, blockEnd - chunkSize);
			const readEnd = Math.min(textLength, blockEnd + overlapSize);

			const found = searchRange(blockStart, readEnd, offset);

			if (found)
				return makeResult(found);

			blockEnd = blockStart;
		}

		if (!allowLooping)
			return null;

		/*
		 * Зацикливание: ищем от конца документа назад к курсору, но только
		 * совпадения, начинающиеся на/после курсора. Возвращаем последнее
		 * совпадение документа — стандартный UX find-previous с wrap.
		 */
		blockEnd = textLength;

		while (blockEnd > offset) {

			const blockStart = Math.max(offset, blockEnd - chunkSize);
			const readStart = Math.max(offset, blockStart - overlapSize);

			const found = searchRange(readStart, blockEnd, textLength + 1);

			if (found && found.index >= offset)
				return makeResult(found);

			blockEnd = blockStart;
		}

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

export default Finder;