#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const Module = require('module');
const esbuild = require('esbuild');
const pako = require('pako');

const ROOT = path.resolve(__dirname, '..');

function loadModule(relativePath, transform) {
    const file = path.join(ROOT, relativePath);
    const fs = require('fs');
    let source = fs.readFileSync(file, 'utf8');
    if (transform) source = transform(source);
    const output = esbuild.buildSync({
        stdin: { contents: source, resolveDir: path.dirname(file), sourcefile: file, loader: 'js' },
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'cjs',
        write: false
    }).outputFiles[0].text;
    const instance = new Module(file, module);
    instance.filename = file;
    instance.paths = module.paths;
    instance._compile(output, file);
    return instance.exports;
}

function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const out = Buffer.alloc(2); out.writeUInt16LE(value); return out; }
function u32(value) { const out = Buffer.alloc(4); out.writeUInt32LE(value >>> 0); return out; }

function makeZip(files, options) {
    options = options || {};
    const locals = [];
    const central = [];
    let offset = 0;
    files.forEach((file, index) => {
        const name = Buffer.from(file.name, 'utf8');
        const plain = Buffer.from(file.data);
        const method = file.method === undefined ? 8 : file.method;
        const packed = method === 0 ? plain : Buffer.from(pako.deflateRaw(plain));
        const flags = (options.encrypted && index === 0 ? 1 : 0) | 0x800;
        const crc = crc32(plain);
        const extra = options.zip64 && index === 0 ? Buffer.concat([u16(1), u16(0)]) : Buffer.alloc(0);
        const local = Buffer.concat([
            u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc),
            u32(packed.length), u32(plain.length), u16(name.length), u16(extra.length), name, extra, packed
        ]);
        locals.push(local);
        central.push(Buffer.concat([
            u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc),
            u32(packed.length), u32(plain.length), u16(name.length), u16(extra.length), u16(0), u16(0),
            u16(0), u32(0), u32(offset), name, extra
        ]));
        offset += local.length;
    });
    const localData = Buffer.concat(locals);
    const centralData = Buffer.concat(central);
    const eocd = Buffer.concat([
        u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
        u32(centralData.length), u32(localData.length), u16(0)
    ]);
    return Buffer.concat([Buffer.from(options.prefix || ''), localData, centralData, eocd, Buffer.from(options.tail || '')]);
}

function testZip() {
    const zip = loadModule('src/help/zip.js');
    const inner = makeZip([{ name: 'stored.txt', data: 'store', method: 0 }, { name: 'deflated.txt', data: 'deflate' }]);
    const outer = makeZip([{ name: 'inner.zip', data: inner }], { prefix: 'PREFIX', tail: 'TAIL' });
    const parsedOuter = zip.readZip(outer);
    assert.equal(parsedOuter.prefixSize, 6);
    assert.equal(parsedOuter.tailSize, 4);
    const parsedInner = zip.readZip(parsedOuter.extract('inner.zip'));
    assert.equal(Buffer.from(parsedInner.extract('stored.txt')).toString(), 'store');
    assert.equal(Buffer.from(parsedInner.extract('deflated.txt')).toString(), 'deflate');

    const corrupted = Buffer.from(inner);
    corrupted[parsedInner.byName['stored.txt'].dataOffset] ^= 1;
    const corruptZip = zip.readZip(corrupted);
    assert.throws(() => corruptZip.extract('stored.txt'), /CRC/);
    assert.throws(() => zip.readZip(makeZip([{ name: 'x', data: 'x' }], { encrypted: true })), /шифрование/);
    assert.throws(() => zip.readZip(makeZip([{ name: 'x', data: 'x' }], { zip64: true })), /Zip64/);
    const badSignature = Buffer.from(inner); badSignature.writeUInt32LE(0, 0);
    assert.throws(() => zip.readZip(badSignature), /local header/);
}

function tocNode(id, parent, children, ru, en, html) {
    return `{${id},${parent},${children.length}${children.map(x => ',' + x).join('')},{1,1,{1,2,{"ru","${ru}"},{"en","${en}"}},"${html}"}}`;
}

function tocSource(nodes) { return `{${nodes.length},${nodes.join(',')}}`; }

function testToc() {
    const { parseToc } = loadModule('src/help/toc.js');
    const source = tocSource([
        tocNode(1, 0, [2], 'Корень', 'Root', 'root.html'),
        tocNode(2, 1, [3], 'Раздел', 'Section', ''),
        tocNode(3, 2, [], 'Страница', 'Page', 'page.html')
    ]);
    const result = parseToc(source);
    assert.equal(result.count, 3);
    assert.equal(result.roots[0].title, 'Корень');
    assert.equal(result.roots[0].alias, 'Root');
    assert.equal(result.roots[0].children[0].path, '');
    assert.equal(result.roots[0].children[0].children[0].path, 'page.html');
    assert.throws(() => parseToc(tocSource([tocNode(1, 0, [99], 'X', 'X', '')])), /неверная ссылка/);
    assert.throws(() => parseToc(tocSource([tocNode(1, 2, [2], 'A', 'A', ''), tocNode(2, 1, [1], 'B', 'B', '')])), /цикл/);
    assert.throws(() => parseToc('{2,' + tocNode(1, 0, [], 'X', 'X', '') + '}'), /количество/);
}

function testNavigation() {
    const navigation = loadModule('src/help/navigation.js');
    const known = {
        properties: 'Свойства', methods: 'Методы', ctors: 'Конструкторы',
        events: 'События', fields: 'Поля', params: 'Параметры', formparams: 'Параметры формы'
    };
    Object.keys(known).forEach(function (segment) {
        const node = { title: '', children: [{ path: 'objects/Owner/' + segment + '/Item.html' }] };
        assert.equal(navigation.inferGroupTitle(node), known[segment], segment);
    });
    assert.equal(navigation.inferGroupTitle({ title: '', children: [
        { path: 'objects/Owner/methods/Call.html' }, { path: 'objects/Owner/events/Event.html' }
    ] }), '', 'смешанный узел не переименовывается');

    const page = {
        id: 'context:objects/catalog/object/methods/Select.html', kind: 'context',
        path: 'objects/catalog/object/methods/Select.html', title: 'Выбрать'
    };
    const pages = {}; pages[page.id] = page;
    const roots = [{ id: 'context:1', title: 'Прикладные объекты', path: '', children: [{
        id: 'context:2', title: 'СправочникМенеджер.<Имя справочника>', path: '', children: [{
            id: 'context:3', title: '', path: '', children: [{
                id: 'context:4', title: 'Выбрать', path: page.path, kind: 'context', children: []
            }]
        }]
    }]}];
    navigation.decorateContextNavigation(roots, pages);
    const group = roots[0].children[0].children[0];
    const leaf = group.children[0];
    assert.equal(group.title, 'Методы');
    assert.equal(page.context, 'СправочникМенеджер.<Имя справочника>/Методы/Выбрать');
    assert.equal(leaf.tocId, 'context:4');
    assert.equal(leaf.id, page.id, 'TOC id заменяется идентификатором статьи');
    assert.equal(navigation.resolvePage(pages, 'context', page.path, 'context:4'), page,
        'при неизвестном TOC id статья находится по kind + path');
}

function testLinks() {
    const links = loadModule('src/help/links.js');
    const current = { kind: 'context', path: 'objects/catalog213/catalog393/Query.html' };
    assert.deepEqual(links.resolveHelpLink('Query/properties/Text1019.html', current), {
        type: 'internal', kind: 'context',
        path: 'objects/catalog213/catalog393/Query/properties/Text1019.html', anchor: ''
    });
    assert.deepEqual(links.resolveHelpLink('./Query\\methods\\Execute564.html?mode=full#syntax', current), {
        type: 'internal', kind: 'context',
        path: 'objects/catalog213/catalog393/Query/methods/Execute564.html', anchor: 'syntax'
    });
    assert.deepEqual(links.resolveHelpLink('../Other/%D0%A2%D0%B5%D0%BA%D1%81%D1%82.html', current), {
        type: 'internal', kind: 'context',
        path: 'objects/catalog213/Other/Текст.html', anchor: ''
    });
    assert.deepEqual(links.resolveHelpLink('/objects/Root.html#%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB', current), {
        type: 'internal', kind: 'context', path: 'objects/Root.html', anchor: 'раздел'
    });
    assert.deepEqual(links.resolveHelpLink('#details', current), {
        type: 'internal', kind: 'context', path: current.path, anchor: 'details'
    });
    assert.deepEqual(links.resolveHelpLink('v8help://SyntaxHelperLanguage/def_String#attribute', current), {
        type: 'internal', kind: 'language', path: 'def_String', anchor: 'attribute'
    });
    assert.deepEqual(links.resolveHelpLink('https://example.com/help', current), {
        type: 'external', href: 'https://example.com/help'
    });
    ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/x', '//example.com/x',
        '\\\\example.com\\x', '../../../../outside.html', '%ZZ.html'].forEach(function (href) {
        assert.equal(links.resolveHelpLink(href, current), null, href);
    });
}

function testSearch() {
    const search = loadModule('src/help/search.js');
    const docs = [
        search.buildSearchDocument({ id: '1', title: 'Строка', path: '1', kind: 'context', text: 'Unicode ёлка' }),
        search.buildSearchDocument({ id: '2', title: 'Работа со строкой', path: '2', kind: 'context', text: 'Строка и число' }),
        search.buildSearchDocument({ id: '3', title: 'Ёж', path: '3', kind: 'context', text: 'строка Unicode' })
    ];
    let result = search.searchDocuments(docs, 'СТРОКА unicode', 1000);
    assert.equal(result.total, 2);
    assert.equal(result.items[0].id, '1', 'совпадение в заголовке ранжируется выше');
    assert.equal(search.searchDocuments(docs, 'елка', 1000).total, 1, 'е/ё эквивалентны');
    const many = Array.from({ length: 1005 }, (_, i) => search.buildSearchDocument({ id: String(i), title: 'Объект ' + i, path: String(i), kind: 'context', text: 'слово' }));
    result = search.searchDocuments(many, 'слово', 1000);
    assert.equal(result.total, 1005); assert.equal(result.items.length, 1000);
    assert.equal(search.prefixSearch([{ title: 'Строка' }, { title: 'Число' }], 'СТР', 10).total, 1);
    const prefixItems = [
        { id: 'first', title: 'Ёлка' }, { id: 'second', title: 'елка большая' },
        { id: 'third', title: 'Работа-со строкой' }, { id: 'fourth', title: 'Число' },
        { id: 'duplicate-1', title: 'СТРОКА' }, { id: 'duplicate-2', title: 'строка' }
    ];
    const prefixIndex = search.preparePrefixIndex(prefixItems);
    result = search.prefixSearch(prefixIndex, 'ЕЛ', 1000);
    assert.deepEqual(result.items.map(item => item.id), ['first', 'second']);
    result = search.prefixSearch(prefixIndex, 'работа со', 1000);
    assert.deepEqual(result.items.map(item => item.id), ['third']);
    result = search.prefixSearch(prefixIndex, 'строка', 1);
    assert.equal(result.total, 2); assert.deepEqual(result.items.map(item => item.id), ['duplicate-1']);
    result = search.prefixSearch(prefixIndex, '', 3);
    assert.equal(result.total, prefixItems.length); assert.equal(result.items.length, 3);
    const left = search.preparePrefixIndex([{ id: 'l1', title: 'Альфа' }, { id: 'l2', title: 'Строка' }]);
    const right = search.preparePrefixIndex([{ id: 'r1', title: 'Бета' }, { id: 'r2', title: 'Строка' }]);
    assert.deepEqual(search.prefixSearch(search.mergePrefixIndexes(left, right), 'строка', 10).items.map(item => item.id), ['l2', 'r2']);
    let titleConversions = 0;
    const largePrefixItems = Array.from({ length: 20000 }, (_, i) => ({ id: String(i), title: { toString() { titleConversions++; return (i % 2 ? 'Строка ' : 'Число ') + i; } } }));
    const largePrefixIndex = search.preparePrefixIndex(largePrefixItems);
    assert.equal(titleConversions, largePrefixItems.length);
    search.prefixSearch(largePrefixIndex, 'с', 1000); search.prefixSearch(largePrefixIndex, 'стр', 1000); search.prefixSearch(largePrefixIndex, 'число 199', 1000);
    assert.equal(titleConversions, largePrefixItems.length);
    assert.deepEqual(Array.from(search.words('Ёлка СТРОКА')), ['елка', 'строка']);
}

function testBase64() {
    const base64 = loadModule('src/base64.js');
    assert.deepEqual(Array.from(base64.decodeBase64('AAEC/f7/')), [0, 1, 2, 253, 254, 255]);
    assert.equal(Buffer.from(base64.decodeBase64(' 0J/RgNC40LLQtdGC\r\n')).toString('utf8'), 'Привет');
    assert.deepEqual(Array.from(base64.decodeBase64('data:application/octet-stream;base64,AQID')), [1, 2, 3]);
    assert.throws(() => base64.decodeBase64(''), /пуста/);
    assert.throws(() => base64.decodeBase64('abc'), /Некорректная/);
    assert.throws(() => base64.decodeBase64('data:text/plain,abc'), /data URL/);
}

async function testBase64Transfer() {
    const transferModule = loadModule('src/base64_transfer.js');
    const manager = transferModule.createBase64TransferManager();
    assert.throws(() => manager.begin('  '), /непустое имя/);
    assert.throws(() => manager.push('AQID'), /beginBase64Transfer/);
    assert.throws(() => manager.end(), /Нет активной/);

    const source = Buffer.from([0, 1, 2, 3, 4, 250, 251, 252, 253, 254, 255]);
    const encoded = source.toString('base64');
    manager.begin(' first ');
    for (let pos = 0; pos < encoded.length; pos++)
        manager.push(encoded.charAt(pos) + (pos % 3 == 0 ? '\r\n' : ''));
    manager.end();
    const first = manager.getReady();
    assert.equal(first.name, 'first');
    assert.equal(first.size, source.length);
    assert.deepEqual(Buffer.from(await first.blob.arrayBuffer()), source);
    assert.strictEqual(manager.getReady(), first, 'готовый Blob не потребляется чтением');

    manager.begin('broken');
    manager.push('AQ');
    assert.throws(() => manager.end(), /Неполная/);
    assert.strictEqual(manager.getReady(), first, 'ошибка end сохраняет предыдущий Blob');
    assert.equal(manager.hasActive(), true);

    manager.begin('replacement'); // отменяет только незавершённую передачу
    assert.throws(() => manager.push('AQ$D'), /Некорректная/);
    manager.push('AQID');
    manager.end();
    const replacement = manager.getReady();
    assert.equal(replacement.name, 'replacement');
    assert.deepEqual(Array.from(new Uint8Array(await replacement.blob.arrayBuffer())), [1, 2, 3]);

    manager.begin('empty');
    assert.throws(() => manager.end(), /пуста/);
    manager.begin('separate-padding');
    manager.push('TQ=='); // каждая порция закодирована независимо и имеет padding
    manager.push('Tg==');
    manager.end();
    assert.equal(Buffer.from(await manager.getReady().blob.arrayBuffer()).toString(), 'MN');

    manager.begin('split-padding');
    manager.push('TQ=');
    manager.push('=');
    manager.end();
    assert.equal(Buffer.from(await manager.getReady().blob.arrayBuffer()).toString(), 'M');

    const megabyte = Buffer.alloc(1024 * 1024, 0xa5);
    const last = Buffer.from([1, 2, 3, 4, 5]);
    manager.begin('one-megabyte-parts');
    manager.push(megabyte.toString('base64'));
    manager.push('\r\n' + last.toString('base64') + '\n');
    manager.end();
    const large = Buffer.from(await manager.getReady().blob.arrayBuffer());
    assert.equal(large.length, megabyte.length + last.length);
    assert.deepEqual(large.subarray(0, megabyte.length), megabyte);
    assert.deepEqual(large.subarray(megabyte.length), last);

    const beforeMalformed = manager.getReady();
    manager.begin('malformed-padding');
    assert.throws(() => manager.push('TQ==Tg=='), /после padding/);
    assert.strictEqual(manager.getReady(), beforeMalformed, 'ошибка порции сохраняет прежний Blob');
}

class FakeWorker {
    postMessage(message) {
        setImmediate(() => {
            if (message.type === 'parse') {
                const source = message.source;
                if (source.fail) return this.onmessage({ data: { id: message.id, type: 'error', payload: { message: 'broken' } } });
                const kind = typeof source === 'string' ? 'language' : source.kind;
                return this.onmessage({ data: { id: message.id, type: 'parsed', payload: {
                    kind, pages: typeof source === 'string' ? 3 : source.pages, navigation: [{ kind, title: kind, children: [] }],
                    index: [{ key: kind, item: { kind, title: kind, path: kind } }], stats: {}
                } } });
            }
            this.onmessage({ data: { id: message.id, type: message.type, payload: { total: 0, items: [] } } });
        });
    }
    terminate() {}
}

function blob(kind, pages, fail) { return { kind, pages, fail, size: 1, slice() {} }; }

async function testService() {
    const serviceModule = loadModule('src/help/service.js', source => source.replace(
        /const workerUrl = require\([^\n]+\);/, "const workerUrl = 'fake';"
    ));
    async function order(first, second) {
        const service = serviceModule.createHelpService(() => new FakeWorker());
        assert.equal((await service.parse(blob(first, 1))).ok, true);
        assert.equal((await service.parse(blob(second, 2))).ok, true);
        assert(service.getState().packages.context);
        assert(service.getState().packages.language);
    }
    await order('context', 'language');
    await order('language', 'context');
    const service = serviceModule.createHelpService(() => new FakeWorker());
    assert.equal(service.isReady(), false);
    const loading = service.parse(blob('context', 10));
    assert.equal(service.isReady(), false, 'loading не является готовой справкой');
    await loading;
    assert.equal(service.isReady(), true);
    const failed = await service.parse(blob('context', 99, true));
    assert.equal(failed.ok, false);
    assert.equal(service.isReady(), false, 'последняя ошибка не является ready');
    assert.equal(service.getState().packages.context.pages, 10, 'ошибка сохраняет старый пакет');
    await service.parse(blob('context', 20));
    assert.equal(service.getState().packages.context.pages, 20, 'успех атомарно заменяет пакет');
    const fromBase64 = await service.parse('AQID');
    assert.equal(fromBase64.ok, true);
    assert.equal(fromBase64.kind, 'language');
    const invalid = await service.parse({});
    assert.deepEqual(Object.keys(invalid).sort(), ['error', 'kind', 'ok', 'pages']);
    assert.equal(service.prefix('LANG', 1000).total, 1);
}

function testUnknownHbk() {
    const reader = loadModule('src/help/hbk-reader.js');
    assert.throws(() => reader.readHbk(Buffer.alloc(2048)), /повреждён контейнер|неверное поле/);
    const unknown = Buffer.alloc(2048);
    unknown.write('0000000c ', 18, 'ascii');
    unknown.write('00000200 ', 27, 'ascii');
    unknown.writeUInt32LE(512, 47); unknown.writeUInt32LE(1024, 51); unknown.writeUInt32LE(0x7fffffff, 55);
    const name = Buffer.from('FileStorage', 'utf16le');
    unknown.write((name.length + 24).toString(16).padStart(8, '0') + ' ', 514, 'ascii');
    name.copy(unknown, 563);
    unknown.write('00000004 ', 1026, 'ascii');
    Buffer.from('nope').copy(unknown, 1055);
    assert.throws(() => reader.readHbk(unknown), /неизвестный пакет/);
}

function testBlobWorkerCheck() {
    const checker = require('../tools/check_blob_workers');
    const good = 'const worker = new Blob([\'self.onmessage = function () {};\'], {type: \'application/javascript\'});';
    assert.equal(checker.checkBlobWorkers(good, 'good.js'), 1);
    const bad = 'const worker = new Blob([\'class Broken { field; }\'], {type: \'application/javascript\'});';
    assert.throws(() => checker.checkBlobWorkers(bad, 'bad.js'), /ES2018/);
}

async function main() {
    testZip();
    testToc();
    testNavigation();
    testLinks();
    testSearch();
    testBase64();
    await testBase64Transfer();
    await testService();
    testUnknownHbk();
    testBlobWorkerCheck();
    console.log('All help browser unit checks passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
