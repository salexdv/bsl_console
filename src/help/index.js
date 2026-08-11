import { createHelpService } from './service';
import { createHelpUi } from './ui';
import { createHelpFileLoader } from './file_loader';
import './help.css';

function createHelpBrowser(editorProvider) {
  const service = createHelpService();
  const ui = createHelpUi(service, editorProvider);
  const fileLoader = createHelpFileLoader(function (file) {
    return typeof window.parseHelp == 'function' ? window.parseHelp(file) : service.parse(file);
  }, function () { ui.show(); });
  return {
    parse: function (source) { return service.parse(source); },
    fail: function (message) { return service.fail(message); },
    show: function () { ui.show(); },
    showIndex: function (query, editor) { return ui.showIndex(query, editor); },
    isReady: function () { return service.isReady(); },
    showLoader: function () { fileLoader.show(); },
    setTheme: function (theme) { ui.setTheme(theme); fileLoader.setTheme(theme); },
    service: service,
    ui: ui,
    fileLoader: fileLoader
  };
}

export { createHelpBrowser };
