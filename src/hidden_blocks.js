class HiddenBlocksController {

  constructor(monaco, isEnglish) {
    this.monaco = monaco;
    this.isEnglish = isEnglish;
    this.states = new Map();
  }

  getState(editor) {
    let state = this.states.get(editor);
    if (state)
      return state;

    state = {
      editor: editor,
      sourceToken: {},
      hidden: new Map(),
      expanded: new Map(),
      mouseListener: null,
      disposeListener: null
    };

    state.mouseListener = editor.onMouseDown(event => {
      let element = event.target && event.target.element;
      let position = event.target && event.target.position;

      if (!element || !position || !element.classList ||
          !element.classList.contains('collapse-hidden-block'))
        return;

      let expandedBlock = state.expanded.get(position.lineNumber);
      if (expandedBlock)
        this.collapse(expandedBlock);
    });

    if (typeof editor.onDidDispose === 'function') {
      state.disposeListener = editor.onDidDispose(() => {
        this.disposeState(state, true);
      });
    }

    this.states.set(editor, state);
    return state;
  }

  setHiddenAreas(state) {
    let ranges = [];
    state.hidden.forEach(function (hiddenBlock) {
      ranges.push(hiddenBlock.range);
    });
    state.editor.setHiddenAreas(ranges, state.sourceToken);
  }

  getHiddenLinesLabel(startLineNumber, endLineNumber) {
    let hiddenLinesCount = endLineNumber - startLineNumber + 1;

    if (this.isEnglish())
      return hiddenLinesCount + (hiddenLinesCount == 1 ? ' hidden line' : ' hidden lines');

    let lastDigit = hiddenLinesCount % 10;
    let lastTwoDigits = hiddenLinesCount % 100;

    if (lastDigit == 1 && lastTwoDigits != 11)
      return hiddenLinesCount + ' скрытая строка';
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14))
      return hiddenLinesCount + ' скрытые строки';
    return hiddenLinesCount + ' скрытых строк';
  }

  createExpandWidget(state, descriptor) {
    let domNode = document.createElement('div');
    let iconNode = document.createElement('span');
    let labelNode = document.createElement('span');
    let lineHeight = state.editor.getOption(this.monaco.editor.EditorOption.lineHeight);

    domNode.className = 'expand-widget';
    iconNode.className = 'codicon codicon-unfold';
    labelNode.className = 'expand-widget-label';
    labelNode.textContent = this.getHiddenLinesLabel(
      descriptor.startLineNumber,
      descriptor.endLineNumber
    );
    domNode.appendChild(iconNode);
    domNode.appendChild(labelNode);
    domNode.onclick = () => {
      let hiddenBlock = state.hidden.get(descriptor.startLineNumber);
      if (hiddenBlock)
        this.expand(hiddenBlock);
    };
    domNode.style.height = lineHeight + 'px';
    domNode.style.lineHeight = lineHeight + 'px';
    domNode.style.width = state.editor.getLayoutInfo().contentWidth + 'px';

    return domNode;
  }

  normalizeDescriptor(model, descriptor) {
    if (!descriptor)
      return null;

    let startLineNumber = Number(descriptor.startLineNumber);
    let endLineNumber = Number(descriptor.endLineNumber);

    if (!Number.isFinite(startLineNumber) || !Number.isFinite(endLineNumber) ||
        Math.floor(startLineNumber) != startLineNumber ||
        Math.floor(endLineNumber) != endLineNumber)
      return null;

    let lineCount = model.getLineCount();
    startLineNumber = Math.max(1, startLineNumber);
    endLineNumber = Math.min(lineCount, endLineNumber);

    if (startLineNumber > lineCount || endLineNumber < startLineNumber)
      return null;

    return {
      startLineNumber: startLineNumber,
      endLineNumber: endLineNumber
    };
  }

  addHiddenBlock(state, descriptor) {
    let model = state.editor.getModel();
    if (!model)
      return null;

    let normalized = this.normalizeDescriptor(model, descriptor);
    if (!normalized || state.hidden.has(normalized.startLineNumber))
      return null;

    this.removeExpandedBlock(state, normalized.startLineNumber);

    let hiddenBlock = {
      state: state,
      descriptor: normalized,
      range: new this.monaco.Range(
        normalized.startLineNumber,
        1,
        normalized.endLineNumber,
        1
      ),
      zoneId: null
    };
    state.hidden.set(normalized.startLineNumber, hiddenBlock);
    return hiddenBlock;
  }

  addHiddenZone(hiddenBlock) {
    let state = hiddenBlock.state;
    let descriptor = hiddenBlock.descriptor;
    let domNode = this.createExpandWidget(state, descriptor);

    state.editor.changeViewZones(function (accessor) {
      hiddenBlock.zoneId = accessor.addZone({
        afterLineNumber: descriptor.startLineNumber - 1,
        heightInLines: 1,
        showInHiddenAreas: true,
        domNode: domNode
      });
    });
  }

  hideBlocks(editor, blocks) {
    if (!editor || !Array.isArray(blocks))
      return;

    let state = this.getState(editor);
    let addedBlocks = [];
    blocks.forEach(block => {
      let hiddenBlock = this.addHiddenBlock(state, block);
      if (hiddenBlock)
        addedBlocks.push(hiddenBlock);
    });
    this.setHiddenAreas(state);
    addedBlocks.forEach(hiddenBlock => {
      this.addHiddenZone(hiddenBlock);
    });
  }

  removeHiddenZone(hiddenBlock) {
    let state = hiddenBlock.state;
    if (hiddenBlock.zoneId !== null) {
      state.editor.changeViewZones(function (accessor) {
        accessor.removeZone(hiddenBlock.zoneId);
      });
      hiddenBlock.zoneId = null;
    }
    state.hidden.delete(hiddenBlock.descriptor.startLineNumber);
  }

  createCollapseDecoration(expandedBlock) {
    let state = expandedBlock.state;
    let lineNumber = expandedBlock.descriptor.startLineNumber;
    state.editor.updateOptions({ glyphMargin: true });
    expandedBlock.decorationIds = state.editor.deltaDecorations([], [{
      range: new this.monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'collapse-hidden-block codicon codicon-fold'
      }
    }]);
  }

  expand(hiddenBlock) {
    let state = hiddenBlock.state;
    this.removeHiddenZone(hiddenBlock);
    this.setHiddenAreas(state);

    let expandedBlock = {
      state: state,
      descriptor: hiddenBlock.descriptor,
      decorationIds: []
    };
    state.expanded.set(hiddenBlock.descriptor.startLineNumber, expandedBlock);
    this.createCollapseDecoration(expandedBlock);
  }

  removeExpandedBlock(state, startLineNumber) {
    let expandedBlock = state.expanded.get(startLineNumber);
    if (!expandedBlock)
      return;

    state.editor.deltaDecorations(expandedBlock.decorationIds, []);
    state.expanded.delete(startLineNumber);
  }

  collapse(expandedBlock) {
    let state = expandedBlock.state;
    let descriptor = expandedBlock.descriptor;
    this.removeExpandedBlock(state, descriptor.startLineNumber);
    let hiddenBlock = this.addHiddenBlock(state, descriptor);
    this.setHiddenAreas(state);
    if (hiddenBlock)
      this.addHiddenZone(hiddenBlock);
  }

  showEditor(editor) {
    let state = this.states.get(editor);
    if (!state)
      return;

    let hiddenBlocks = Array.from(state.hidden.values());
    hiddenBlocks.forEach(hiddenBlock => {
      if (state.hidden.has(hiddenBlock.descriptor.startLineNumber))
        this.expand(hiddenBlock);
    });
  }

  clearState(state, disposing) {
    let hiddenBlocks = Array.from(state.hidden.values());
    state.editor.changeViewZones(function (accessor) {
      hiddenBlocks.forEach(function (hiddenBlock) {
        if (hiddenBlock.zoneId !== null)
          accessor.removeZone(hiddenBlock.zoneId);
      });
    });
    state.hidden.clear();

    state.expanded.forEach(function (expandedBlock) {
      state.editor.deltaDecorations(expandedBlock.decorationIds, []);
    });
    state.expanded.clear();

    if (!disposing)
      this.setHiddenAreas(state);
  }

  disposeState(state, fromEditorDispose) {
    if (!this.states.has(state.editor))
      return;

    if (!fromEditorDispose)
      this.clearState(state, false);
    if (state.mouseListener)
      state.mouseListener.dispose();
    if (state.disposeListener && !fromEditorDispose)
      state.disposeListener.dispose();
    this.states.delete(state.editor);
  }

  disposeEditor(editor) {
    let state = this.states.get(editor);
    if (state)
      this.disposeState(state, true);
  }

}

export default HiddenBlocksController;
