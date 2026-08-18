import { createHelpService } from './service';
import { createHelpUi } from './ui';
import { createHelpFileLoader } from './file_loader';
import './help.css';

function createHelpBrowser(editorProvider, onExternalLink) {
  const service = createHelpService();
  const ui = createHelpUi(service, editorProvider, onExternalLink);
  const fileLoader = createHelpFileLoader(function (file) {
    return typeof window.parseHelp == 'function' ? window.parseHelp(file) : service.parse(file);
  }, function () { ui.show(); });
  return {
    parse: function (source) { return service.parse(source); },
    parseTransferred: function () { return service.parseTransferred(); },
    beginTransfer: function (name) { service.beginTransfer(name); },
    pushTransfer: function (chunk) { service.pushTransfer(chunk); },
    endTransfer: function () { service.endTransfer(); },
    fail: function (message) { return service.fail(message); },
    show: function () { ui.show(); },
    showIndex: function (query, editor) { return ui.showIndex(query, editor); },
    isReady: function () { return service.isReady(); },
    getState: function () { return service.getState(); },
    setLanguageMode: function (mode) {
      if (mode == 'bsl_query') service.setKinds(['query']);
      else if (mode == 'dcs_query') service.setKinds(['dcs']);
      else service.setKinds(['context', 'language']);
    },
    showLoader: function () { fileLoader.show(); },
    setTheme: function (theme) { ui.setTheme(theme); fileLoader.setTheme(theme); },
    service: service,
    ui: ui,
    fileLoader: fileLoader
  };
}

export { createHelpBrowser };
