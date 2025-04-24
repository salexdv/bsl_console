const nlsMetadata = require('monaco-editor/dev/nls.metadata.json');
import * as ruLocale from 'monaco-editor/dev/vs/editor/editor.main.nls.ru';
export { getConfiguredDefaultLocale, create, setPseudoTranslation } from 'monaco-editor/esm/vs/nls';

let isPseudo = (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);

let CURRENT_LOCALE_DATA = null;

setLocaleData(ruLocale);

function _getTranslation(message) {
    const source = CURRENT_LOCALE_DATA || {};
    let translation = source[message];
    if (!translation)
        translation = message;
    return translation;
}

function _formatMessage(message, args) {
    let result;
    if (args.length === 0) {
        result = _getTranslation(message);
    }
    else {
        result = message.replace(/\{(\d+)\}/g, (match, rest) => {
            const index = rest[0];
            const arg = args[index];
            let result = match;
            if (typeof arg === 'string') {
                result = arg;
            }
            else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === void 0 || arg === null) {
                result = String(arg);
            }
            return result;
        });
    }
    if (isPseudo) {
        // FF3B and FF3D is the Unicode zenkaku representation for [ and ]
        result = '\uFF3B' + result.replace(/[aouei]/g, '$&$&') + '\uFF3D';
    }
    return result;
}

export function localize(data, message, ...args) {
    const a = args.map(e => {
        return _getTranslation(e)
    })
    return _formatMessage(_getTranslation(message), a);
}

export function localize2(data, message, ...args) {
    const original = _formatMessage(_getTranslation(message), args);
    return {
        value: original,
        original
    };
}

export function setLocaleData(locale) {
    CURRENT_LOCALE_DATA = {};
    for (const [key, value] of Object.entries(nlsMetadata.keys)) {
      if (Array.isArray(value)) {
        for(let i = 0; i < value.length; i++) {
          CURRENT_LOCALE_DATA[nlsMetadata.messages[key][i]] = locale[key][i];
        }
      }
    }
}
