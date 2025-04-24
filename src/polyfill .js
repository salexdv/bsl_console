/*! matchMedia() polyfill addListener/removeListener extension. Author & copyright (c) 2012: Scott Jehl. MIT license */
import '@ungap/global-this';
import ResizeObserver from 'resize-observer-polyfill';
import 'performance-polyfill'

if (typeof WeakRef === 'undefined') {
    globalThis.WeakRef = class {
        constructor(value) {
            this._value = value;
        }
        deref() {
            return this._value;
        }
    };
}

if (!Array.prototype.flat) {
    Array.prototype.flat = function (depth = 1) {
        const flatten = (arr, d) => {
            if (d < 1) return arr.slice();
            return arr.reduce((acc, val) => {
                if (Array.isArray(val)) {
                    acc.push(...flatten(val, d - 1));
                } else {
                    acc.push(val);
                }
                return acc;
            }, []);
        };
        return flatten(this, depth);
    };
}

if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (callback, thisArg) {
        return this.map(callback, thisArg).flat();
    };
}

if (typeof navigator.clipboard === "undefined") {

    window.ClipboardItem = function (items) {
        this.types = Object.keys(items);
        this._items = items;
        this.getType = function (type) {
            return Promise.resolve(this._items[type]);
        };
    };

    navigator.clipboard = {};
    navigator.clipboard.write = async function (items) {
        const textItem = items.find(item => item.types.includes("text/plain"));
        if (!textItem) {
            throw new Error("Only text/plain ClipboardItems are supported in this polyfill.");
        }

        const blob = await textItem.getType("text/plain");
        const text = await blob.text();

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = 0;
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
            const success = document.execCommand("copy");
            if (!success) throw new Error("Copy failed");
        } finally {
            document.body.removeChild(textarea);
        }
    };
}

if (!window.ResizeObserver) {
    window.ResizeObserver = ResizeObserver
}

if (!window.matchMedia('').addEventListener) {
    var localMatchMedia = window.matchMedia;
    window.matchMedia = function (mql) {
        var res = localMatchMedia(mql);

        res.addEventListener = function (type, listener) {
            res.addListener(listener)
        }
        console.log('matchMedia', mql, res)
        return res
    }
}

if (!('isConnected' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'isConnected', {
        get() {
            return (
                !this.ownerDocument ||
                !(
                    this.ownerDocument.compareDocumentPosition(this) &
                    this.DOCUMENT_POSITION_DISCONNECTED
                )
            );
        },
    });
}

export function makeLogProxy(obj) {
    const handler3 = {
        get(target, prop, receiver) {
            const res = Reflect.get(...arguments);
            console.log('get', prop, res)

            return res;
        },
    };
    return new Proxy(obj, handler3)
}

window.makeLogProxy = makeLogProxy

if (!window.queueMicrotask) {
    window.queueMicrotask = function (callback) {
        Promise.resolve()
            .then(callback)
            .catch(e => setTimeout(() => { throw e; }));
    };
}

var ecmaScriptInfo = (function () {
    // () => { is not allowed
    function getESEdition() {
        var array = [];
        switch (true) {
            case !Array.isArray:
                return 3;
            case !window.Promise:
                return 5;
            case !array.includes:
                return 6;
            case !''.padStart:
                return 7;
            case !Promise.prototype.finally:
                return 8;
            case !window.BigInt:
                return 9;
            case !Promise.allSettled:
                return 10;
            case !''.replaceAll:
                return 11;
            case !array.at:
                return 12;
            default:
                return 13;
        }
    }

    function getESYear(edition) {
        return {
            3: 1999,
            5: 2009
        }[edition] || (2009 + edition); // nullish coalescing (??) is not allowed
    }

    var edition = getESEdition();
    var year = getESYear(edition);

    return {
        edition: edition, // usually shortened [edition,]
        year: year,       // usually shortened [year,]
        text: 'Edition: ' + edition + ' | Year: ' + year
    }
})();

console.info('ECMAScript ', ecmaScriptInfo.text);