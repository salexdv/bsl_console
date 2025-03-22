Monaco Editor APIeditorITextModel
Interface ITextModel
A model.

interface ITextModel {
    id: string;
    onDidChangeAttached: IEvent<void>;
    onDidChangeDecorations: IEvent<IModelDecorationsChangedEvent>;
    onDidChangeLanguage: IEvent<IModelLanguageChangedEvent>;
    onDidChangeLanguageConfiguration: IEvent<IModelLanguageConfigurationChangedEvent>;
    onDidChangeOptions: IEvent<IModelOptionsChangedEvent>;
    onWillDispose: IEvent<void>;
    uri: Uri;
    applyEdits(operations): void;
    applyEdits(operations, computeUndoEdits): void;
    applyEdits(operations, computeUndoEdits): IValidEditOperation[];
    createSnapshot(preserveBOM?): ITextSnapshot;
    deltaDecorations(oldDecorations, newDecorations, ownerId?): string[];
    detectIndentation(defaultInsertSpaces, defaultTabSize): void;
    dispose(): void;
    findMatches(searchString, searchOnlyEditableRange, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount?): FindMatch[];
    findMatches(searchString, searchScope, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount?): FindMatch[];
    findNextMatch(searchString, searchStart, isRegex, matchCase, wordSeparators, captureMatches): FindMatch;
    findPreviousMatch(searchString, searchStart, isRegex, matchCase, wordSeparators, captureMatches): FindMatch;
    getAllDecorations(ownerId?, filterOutValidation?): IModelDecoration[];
    getAllMarginDecorations(ownerId?): IModelDecoration[];
    getAlternativeVersionId(): number;
    getCharacterCountInRange(range, eol?): number;
    getDecorationOptions(id): IModelDecorationOptions;
    getDecorationRange(id): Range;
    getDecorationsInRange(range, ownerId?, filterOutValidation?, onlyMinimapDecorations?, onlyMarginDecorations?): IModelDecoration[];
    getEOL(): string;
    getEndOfLineSequence(): EndOfLineSequence;
    getFullModelRange(): Range;
    getInjectedTextDecorations(ownerId?): IModelDecoration[];
    getLanguageId(): string;
    getLineContent(lineNumber): string;
    getLineCount(): number;
    getLineDecorations(lineNumber, ownerId?, filterOutValidation?): IModelDecoration[];
    getLineFirstNonWhitespaceColumn(lineNumber): number;
    getLineLastNonWhitespaceColumn(lineNumber): number;
    getLineLength(lineNumber): number;
    getLineMaxColumn(lineNumber): number;
    getLineMinColumn(lineNumber): number;
    getLinesContent(): string[];
    getLinesDecorations(startLineNumber, endLineNumber, ownerId?, filterOutValidation?): IModelDecoration[];
    getOffsetAt(position): number;
    getOptions(): TextModelResolvedOptions;
    getOverviewRulerDecorations(ownerId?, filterOutValidation?): IModelDecoration[];
    getPositionAt(offset): Position;
    getValue(eol?, preserveBOM?): string;
    getValueInRange(range, eol?): string;
    getValueLength(eol?, preserveBOM?): number;
    getValueLengthInRange(range, eol?): number;
    getVersionId(): number;
    getWordAtPosition(position): IWordAtPosition;
    getWordUntilPosition(position): IWordAtPosition;
    isAttachedToEditor(): boolean;
    isDisposed(): boolean;
    modifyPosition(position, offset): Position;
    normalizeIndentation(str): string;
    onDidChangeContent(listener): IDisposable;
    popStackElement(): void;
    pushEOL(eol): void;
    pushEditOperations(beforeCursorState, editOperations, cursorStateComputer): Selection[];
    pushStackElement(): void;
    setEOL(eol): void;
    setValue(newValue): void;
    updateOptions(newOpts): void;
    validatePosition(position): Position;
    validateRange(range): Range;
}
Defined in editor.api.d.ts:1997
Properties
id
uri
Methods
applyEdits
createSnapshot
deltaDecorations
detectIndentation
dispose
findMatches
findNextMatch
findPreviousMatch
getAllDecorations
getAllMarginDecorations
getAlternativeVersionId
getCharacterCountInRange
getDecorationOptions
getDecorationRange
getDecorationsInRange
getEOL
getEndOfLineSequence
getFullModelRange
getInjectedTextDecorations
getLanguageId
getLineContent
getLineCount
getLineDecorations
getLineFirstNonWhitespaceColumn
getLineLastNonWhitespaceColumn
getLineLength
getLineMaxColumn
getLineMinColumn
getLinesContent
getLinesDecorations
getOffsetAt
getOptions
getOverviewRulerDecorations
getPositionAt
getValue
getValueInRange
getValueLength
getValueLengthInRange
getVersionId
getWordAtPosition
getWordUntilPosition
isAttachedToEditor
isDisposed
modifyPosition
normalizeIndentation
popStackElement
pushEOL
pushEditOperations
pushStackElement
setEOL
setValue
updateOptions
validatePosition
validateRange
Events
onDidChangeAttached
onDidChangeDecorations
onDidChangeLanguage
onDidChangeLanguageConfiguration
onDidChangeOptions
onWillDispose
onDidChangeContent
Properties
Readonly
id
id: string
A unique identifier associated with this model.

Defined in editor.api.d.ts:2005
Readonly
uri
uri: Uri
Gets the resource associated with this editor model.

Defined in editor.api.d.ts:2001
Methods
applyEdits
applyEdits(operations): void
Edit the model without adding the edits to the undo stack. This can have dire consequences on the undo stack! See

Parameters
operations: IIdentifiedSingleEditOperation[]
The edit operations.

Returns void
If desired, the inverse edit operations, that, when applied, will bring the model back to the previous state.

Push Edit Operations
for the preferred way.

Defined in editor.api.d.ts:2324
applyEdits(operations, computeUndoEdits): void
Parameters
operations: IIdentifiedSingleEditOperation[]
computeUndoEdits: false
Returns void
Defined in editor.api.d.ts:2325
applyEdits(operations, computeUndoEdits): IValidEditOperation[]
Parameters
operations: IIdentifiedSingleEditOperation[]
computeUndoEdits: true
Returns IValidEditOperation[]
Defined in editor.api.d.ts:2326
createSnapshot
createSnapshot(preserveBOM?): ITextSnapshot
Get the text stored in this model.

Parameters
Optional preserveBOM: boolean
Returns ITextSnapshot
The text snapshot (it is safe to consume it asynchronously).

Defined in editor.api.d.ts:2038
deltaDecorations
deltaDecorations(oldDecorations, newDecorations, ownerId?): string[]
Perform a minimum amount of operations, in order to transform the decorations identified by oldDecorations to the decorations described by newDecorations and returns the new identifiers associated with the resulting decorations.

Parameters
oldDecorations: string[]
Array containing previous decorations identifiers.

newDecorations: IModelDeltaDecoration[]
Array describing what decorations should result after the call.

Optional ownerId: number
Identifies the editor id in which these decorations should appear. If no ownerId is provided, the decorations will appear in all editors that attach this model.

Returns string[]
An array containing the new decorations identifiers.

Defined in editor.api.d.ts:2219
detectIndentation
detectIndentation(defaultInsertSpaces, defaultTabSize): void
Detect the indentation options for this model from its content.

Parameters
defaultInsertSpaces: boolean
defaultTabSize: number
Returns void
Defined in editor.api.d.ts:2293
dispose
dispose(): void
Destroy this model.

Returns void
Defined in editor.api.d.ts:2370
findMatches
findMatches(searchString, searchOnlyEditableRange, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount?): FindMatch[]
Search the model.

Parameters
searchString: string
The string used to search. If it is a regular expression, set isRegex to true.

searchOnlyEditableRange: boolean
Limit the searching to only search inside the editable range of the model.

isRegex: boolean
Used to indicate that searchString is a regular expression.

matchCase: boolean
Force the matching to match lower/upper case exactly.

wordSeparators: string
Force the matching to match entire words only. Pass null otherwise.

captureMatches: boolean
The result will contain the captured groups.

Optional limitResultCount: number
Limit the number of results

Returns FindMatch[]
The ranges where the matches are. It is empty if not matches have been found.

Defined in editor.api.d.ts:2158
findMatches(searchString, searchScope, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount?): FindMatch[]
Search the model.

Parameters
searchString: string
The string used to search. If it is a regular expression, set isRegex to true.

searchScope: IRange | IRange[]
Limit the searching to only search inside these ranges.

isRegex: boolean
Used to indicate that searchString is a regular expression.

matchCase: boolean
Force the matching to match lower/upper case exactly.

wordSeparators: string
Force the matching to match entire words only. Pass null otherwise.

captureMatches: boolean
The result will contain the captured groups.

Optional limitResultCount: number
Limit the number of results

Returns FindMatch[]
The ranges where the matches are. It is empty if no matches have been found.

Defined in editor.api.d.ts:2170
findNextMatch
findNextMatch(searchString, searchStart, isRegex, matchCase, wordSeparators, captureMatches): FindMatch
Search the model for the next match. Loops to the beginning of the model if needed.

Parameters
searchString: string
The string used to search. If it is a regular expression, set isRegex to true.

searchStart: IPosition
Start the searching at the specified position.

isRegex: boolean
Used to indicate that searchString is a regular expression.

matchCase: boolean
Force the matching to match lower/upper case exactly.

wordSeparators: string
Force the matching to match entire words only. Pass null otherwise.

captureMatches: boolean
The result will contain the captured groups.

Returns FindMatch
The range where the next match is. It is null if no next match has been found.

Defined in editor.api.d.ts:2181
findPreviousMatch
findPreviousMatch(searchString, searchStart, isRegex, matchCase, wordSeparators, captureMatches): FindMatch
Search the model for the previous match. Loops to the end of the model if needed.

Parameters
searchString: string
The string used to search. If it is a regular expression, set isRegex to true.

searchStart: IPosition
Start the searching at the specified position.

isRegex: boolean
Used to indicate that searchString is a regular expression.

matchCase: boolean
Force the matching to match lower/upper case exactly.

wordSeparators: string
Force the matching to match entire words only. Pass null otherwise.

captureMatches: boolean
The result will contain the captured groups.

Returns FindMatch
The range where the previous match is. It is null if no previous match has been found.

Defined in editor.api.d.ts:2192
getAllDecorations
getAllDecorations(ownerId?, filterOutValidation?): IModelDecoration[]
Gets all the decorations as an array.

Parameters
Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Optional filterOutValidation: boolean
If set, it will ignore decorations specific to validation (i.e. warnings, errors).

Returns IModelDecoration[]
Defined in editor.api.d.ts:2265
getAllMarginDecorations
getAllMarginDecorations(ownerId?): IModelDecoration[]
Gets all decorations that render in the glyph margin as an array.

Parameters
Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Returns IModelDecoration[]
Defined in editor.api.d.ts:2270
getAlternativeVersionId
getAlternativeVersionId(): number
Get the alternative version id of the model. This alternative version id is not always incremented, it will return the same values in the case of undo-redo.

Returns number
Defined in editor.api.d.ts:2021
getCharacterCountInRange
getCharacterCountInRange(range, eol?): number
Get the character count of text in a certain range.

Parameters
range: IRange
The range describing what text length to get.

Optional eol: EndOfLinePreference
Returns number
Defined in editor.api.d.ts:2060
getDecorationOptions
getDecorationOptions(id): IModelDecorationOptions
Get the options associated with a decoration.

Parameters
id: string
The decoration id.

Returns IModelDecorationOptions
The decoration options or null if the decoration was not found.

Defined in editor.api.d.ts:2225
getDecorationRange
getDecorationRange(id): Range
Get the range associated with a decoration.

Parameters
id: string
The decoration id.

Returns Range
The decoration range or null if the decoration was not found.

Defined in editor.api.d.ts:2231
getDecorationsInRange
getDecorationsInRange(range, ownerId?, filterOutValidation?, onlyMinimapDecorations?, onlyMarginDecorations?): IModelDecoration[]
Gets all the decorations in a range as an array. Only startLineNumber and endLineNumber from range are used for filtering. So for now it returns all the decorations on the same line as range.

Parameters
range: IRange
The range to search in

Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Optional filterOutValidation: boolean
If set, it will ignore decorations specific to validation (i.e. warnings, errors).

Optional onlyMinimapDecorations: boolean
If set, it will return only decorations that render in the minimap.

Optional onlyMarginDecorations: boolean
If set, it will return only decorations that render in the glyph margin.

Returns IModelDecoration[]
An array with the decorations

Defined in editor.api.d.ts:2259
getEOL
getEOL(): string
Get the end of line sequence predominantly used in the text buffer.

Returns string
EOL char sequence (e.g.: '\n' or '\r\n').

Defined in editor.api.d.ts:2081
getEndOfLineSequence
getEndOfLineSequence(): EndOfLineSequence
Get the end of line sequence predominantly used in the text buffer.

Returns EndOfLineSequence
Defined in editor.api.d.ts:2085
getFullModelRange
getFullModelRange(): Range
Get a range covering the entire model.

Returns Range
Defined in editor.api.d.ts:2142
getInjectedTextDecorations
getInjectedTextDecorations(ownerId?): IModelDecoration[]
Gets all the decorations that contain injected text.

Parameters
Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Returns IModelDecoration[]
Defined in editor.api.d.ts:2281
getLanguageId
getLanguageId(): string
Get the language associated with this model.

Returns string
Defined in editor.api.d.ts:2196
getLineContent
getLineContent(lineNumber): string
Get the text for a certain line.

Parameters
lineNumber: number
Returns string
Defined in editor.api.d.ts:2068
getLineCount
getLineCount(): number
Get the number of lines in the model.

Returns number
Defined in editor.api.d.ts:2064
getLineDecorations
getLineDecorations(lineNumber, ownerId?, filterOutValidation?): IModelDecoration[]
Gets all the decorations for the line lineNumber as an array.

Parameters
lineNumber: number
The line number

Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Optional filterOutValidation: boolean
If set, it will ignore decorations specific to validation (i.e. warnings, errors).

Returns IModelDecoration[]
An array with the decorations

Defined in editor.api.d.ts:2239
getLineFirstNonWhitespaceColumn
getLineFirstNonWhitespaceColumn(lineNumber): number
Returns the column before the first non whitespace character for line at lineNumber. Returns 0 if line is empty or contains only whitespace.

Parameters
lineNumber: number
Returns number
Defined in editor.api.d.ts:2098
getLineLastNonWhitespaceColumn
getLineLastNonWhitespaceColumn(lineNumber): number
Returns the column after the last non whitespace character for line at lineNumber. Returns 0 if line is empty or contains only whitespace.

Parameters
lineNumber: number
Returns number
Defined in editor.api.d.ts:2103
getLineLength
getLineLength(lineNumber): number
Get the text length for a certain line.

Parameters
lineNumber: number
Returns number
Defined in editor.api.d.ts:2072
getLineMaxColumn
getLineMaxColumn(lineNumber): number
Get the maximum legal column for line at lineNumber

Parameters
lineNumber: number
Returns number
Defined in editor.api.d.ts:2093
getLineMinColumn
getLineMinColumn(lineNumber): number
Get the minimum legal column for line at lineNumber

Parameters
lineNumber: number
Returns number
Defined in editor.api.d.ts:2089
getLinesContent
getLinesContent(): string[]
Get the text for all lines.

Returns string[]
Defined in editor.api.d.ts:2076
getLinesDecorations
getLinesDecorations(startLineNumber, endLineNumber, ownerId?, filterOutValidation?): IModelDecoration[]
Gets all the decorations for the lines between startLineNumber and endLineNumber as an array.

Parameters
startLineNumber: number
The start line number

endLineNumber: number
The end line number

Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Optional filterOutValidation: boolean
If set, it will ignore decorations specific to validation (i.e. warnings, errors).

Returns IModelDecoration[]
An array with the decorations

Defined in editor.api.d.ts:2248
getOffsetAt
getOffsetAt(position): number
Converts the position to a zero-based offset.

The position will be adjusted.

Parameters
position: IPosition
A position.

Returns number
A valid zero-based offset.

Defined in editor.api.d.ts:2131
getOptions
getOptions(): TextModelResolvedOptions
Get the resolved options for this model.

Returns TextModelResolvedOptions
Defined in editor.api.d.ts:2009
getOverviewRulerDecorations
getOverviewRulerDecorations(ownerId?, filterOutValidation?): IModelDecoration[]
Gets all the decorations that should be rendered in the overview ruler as an array.

Parameters
Optional ownerId: number
If set, it will ignore decorations belonging to other owners.

Optional filterOutValidation: boolean
If set, it will ignore decorations specific to validation (i.e. warnings, errors).

Returns IModelDecoration[]
Defined in editor.api.d.ts:2276
getPositionAt
getPositionAt(offset): Position
Converts a zero-based offset to a position.

Parameters
offset: number
A zero-based offset.

Returns Position
A valid position.

Defined in editor.api.d.ts:2138
getValue
getValue(eol?, preserveBOM?): string
Get the text stored in this model.

Parameters
Optional eol: EndOfLinePreference
The end of line character preference. Defaults to EndOfLinePreference.TextDefined.

Optional preserveBOM: boolean
Returns string
The text.

Defined in editor.api.d.ts:2032
getValueInRange
getValueInRange(range, eol?): string
Get the text in a certain range.

Parameters
range: IRange
The range describing what text to get.

Optional eol: EndOfLinePreference
The end of line character preference. This will only be used for multiline ranges. Defaults to EndOfLinePreference.TextDefined.

Returns string
The text.

Defined in editor.api.d.ts:2049
getValueLength
getValueLength(eol?, preserveBOM?): number
Get the length of the text stored in this model.

Parameters
Optional eol: EndOfLinePreference
Optional preserveBOM: boolean
Returns number
Defined in editor.api.d.ts:2042
getValueLengthInRange
getValueLengthInRange(range, eol?): number
Get the length of text in a certain range.

Parameters
range: IRange
The range describing what text length to get.

Optional eol: EndOfLinePreference
Returns number
The text length.

Defined in editor.api.d.ts:2055
getVersionId
getVersionId(): number
Get the current version id of the model. Anytime a change happens to the model (even undo/redo), the version id is incremented.

Returns number
Defined in editor.api.d.ts:2015
getWordAtPosition
getWordAtPosition(position): IWordAtPosition
Get the word under or besides position.

Parameters
position: IPosition
The position to look for a word.

Returns IWordAtPosition
The word under or besides position. Might be null.

Defined in editor.api.d.ts:2202
getWordUntilPosition
getWordUntilPosition(position): IWordAtPosition
Get the word under or besides position trimmed to position.column

Parameters
position: IPosition
The position to look for a word.

Returns IWordAtPosition
The word under or besides position. Will never be null.

Defined in editor.api.d.ts:2208
isAttachedToEditor
isAttachedToEditor(): boolean
Returns if this model is attached to an editor or not.

Returns boolean
Defined in editor.api.d.ts:2374
isDisposed
isDisposed(): boolean
Returns if the model was disposed or not.

Returns boolean
Defined in editor.api.d.ts:2146
modifyPosition
modifyPosition(position, offset): Position
Advances the given position by the given offset (negative offsets are also accepted) and returns it as a new valid position.

If the offset and position are such that their combination goes beyond the beginning or end of the model, throws an exception.

If the offset is such that the new position would be in the middle of a multi-byte line terminator, throws an exception.

Parameters
position: IPosition
offset: number
Returns Position
Defined in editor.api.d.ts:2118
normalizeIndentation
normalizeIndentation(str): string
Normalize a string containing whitespace according to indentation rules (converts to spaces or to tabs).

Parameters
str: string
Returns string
Defined in editor.api.d.ts:2285
popStackElement
popStackElement(): void
Open the current undo-redo element. This offers a way to remove the current undo/redo stop point.

Returns void
Defined in editor.api.d.ts:2303
pushEOL
pushEOL(eol): void
Change the end of line sequence. This is the preferred way of changing the eol sequence. This will land on the undo stack.

Parameters
eol: EndOfLineSequence
Returns void
Defined in editor.api.d.ts:2317
pushEditOperations
pushEditOperations(beforeCursorState, editOperations, cursorStateComputer): Selection[]
Push edit operations, basically editing the model. This is the preferred way of editing the model. The edit operations will land on the undo stack.

Parameters
beforeCursorState: Selection[]
The cursor state before the edit operations. This cursor state will be returned when undo or redo are invoked.

editOperations: IIdentifiedSingleEditOperation[]
The edit operations.

cursorStateComputer: ICursorStateComputer
A callback that can compute the resulting cursors state after the edit operations have been executed.

Returns Selection[]
The cursor state returned by the cursorStateComputer.

Defined in editor.api.d.ts:2312
pushStackElement
pushStackElement(): void
Close the current undo-redo element. This offers a way to create an undo/redo stop point.

Returns void
Defined in editor.api.d.ts:2298
setEOL
setEOL(eol): void
Change the end of line sequence without recording in the undo stack. This can have dire consequences on the undo stack! See

Parameters
eol: EndOfLineSequence
Returns void
Push EOL
for the preferred way.

Defined in editor.api.d.ts:2331
setValue
setValue(newValue): void
Replace the entire text buffer value contained in this model.

Parameters
newValue: string | ITextSnapshot
Returns void
Defined in editor.api.d.ts:2025
updateOptions
updateOptions(newOpts): void
Change the options of this model.

Parameters
newOpts: ITextModelUpdateOptions
Returns void
Defined in editor.api.d.ts:2289
validatePosition
validatePosition(position): Position
Create a valid position.

Parameters
position: IPosition
Returns Position
Defined in editor.api.d.ts:2107
validateRange
validateRange(range): Range
Create a valid range.

Parameters
range: IRange
Returns Range
Defined in editor.api.d.ts:2122
Events
Readonly
onDidChangeAttached
onDidChangeAttached: IEvent<void>
An event emitted when the model has been attached to the first editor or detached from the last editor.

Defined in editor.api.d.ts:2361
Readonly
onDidChangeDecorations
onDidChangeDecorations: IEvent<IModelDecorationsChangedEvent>
An event emitted when decorations of the model have changed.

Defined in editor.api.d.ts:2341
Readonly
onDidChangeLanguage
onDidChangeLanguage: IEvent<IModelLanguageChangedEvent>
An event emitted when the language associated with the model has changed.

Defined in editor.api.d.ts:2351
Readonly
onDidChangeLanguageConfiguration
onDidChangeLanguageConfiguration: IEvent<IModelLanguageConfigurationChangedEvent>
An event emitted when the language configuration associated with the model has changed.

Defined in editor.api.d.ts:2356
Readonly
onDidChangeOptions
onDidChangeOptions: IEvent<IModelOptionsChangedEvent>
An event emitted when the model options have changed.

Defined in editor.api.d.ts:2346
Readonly
onWillDispose
onWillDispose: IEvent<void>
An event emitted right before disposing the model.

Defined in editor.api.d.ts:2366
onDidChangeContent
onDidChangeContent(listener): IDisposable
An event emitted when the contents of the model have changed.

Parameters
listener: ((e) => void)
(e): void
Parameters
e: IModelContentChangedEvent
Returns void
Returns IDisposable