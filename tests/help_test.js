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

function writeHexField(buffer, offset, value) {
    buffer.write(value.toString(16).padStart(8, '0') + ' ', offset, 'ascii');
}

function makeContainer(entities) {
    const records = [];
    let bodyAddress = 1024;
    entities.forEach((entity, index) => {
        const data = Buffer.isBuffer(entity.data) ? entity.data : Buffer.from(entity.data);
        records.push({ name: entity.name, data, headerAddress: 512 + index * 128, bodyAddress });
        bodyAddress += 31 + data.length + 64;
    });
    const result = Buffer.alloc(bodyAddress);
    writeHexField(result, 18, records.length * 12);
    writeHexField(result, 27, 512);
    records.forEach((record, index) => {
        const table = 47 + index * 12;
        result.writeUInt32LE(record.headerAddress, table);
        result.writeUInt32LE(record.bodyAddress, table + 4);
        result.writeUInt32LE(0x7fffffff, table + 8);
        const name = Buffer.from(record.name, 'utf16le');
        writeHexField(result, record.headerAddress + 2, name.length + 24);
        name.copy(result, record.headerAddress + 51);
        writeHexField(result, record.bodyAddress + 2, record.data.length);
        record.data.copy(result, record.bodyAddress + 31);
    });
    return result;
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

function writeBlockHeader(buffer, address, documentSize, blockSize, next) {
    buffer.write('\r\n' + documentSize.toString(16).padStart(8, '0') + ' '
        + blockSize.toString(16).padStart(8, '0') + ' '
        + next.toString(16).padStart(8, '0') + '\r\n', address, 'ascii');
}

function testHbkBlocks() {
    const reader = loadModule('src/help/hbk-reader.js');
    const chained = Buffer.alloc(320);
    writeBlockHeader(chained, 32, 10, 5, 192);
    Buffer.from('hello').copy(chained, 63);
    writeBlockHeader(chained, 192, 0, 16, 0x7fffffff);
    Buffer.from('world').copy(chained, 223);
    assert.equal(Buffer.from(reader.readBlockDocument(chained, 32, 'test')).toString(), 'helloworld');
    writeBlockHeader(chained, 192, 0, 16, 32);
    assert.throws(() => reader.readBlockDocument(chained, 32, 'cycle'), /лишний следующий блок|цикл/);

    const missing = Buffer.alloc(96);
    missing.write('0000000c ', 18, 'ascii'); missing.write('0000000c ', 27, 'ascii');
    missing.writeUInt32LE(0x7fffffff, 47); missing.writeUInt32LE(0x7fffffff, 51);
    missing.writeUInt32LE(0x7fffffff, 55);
    assert.deepEqual(reader.extractEntities(missing), {}, 'отсутствующая сущность пропускается');
}

function makeBookHbk(bookName, pageName, pageTitle) {
    const toc = tocSource([
        tocNodeNoNames(1, 0, [2], ''),
        tocNode(2, 1, [], pageTitle, pageTitle, pageName)
    ]);
    return makeContainer([
        { name: 'Book', data: Buffer.from(`\ufeff{2,"${bookName}"}`) },
        { name: 'FileStorage', data: makeZip([
            { name: pageName, data: `<html><h1 class="V8SH_pagetitle">${pageTitle}</h1><p>Профильная статья</p></html>` },
            { name: '__categories__', data: '{0}' }
        ]) },
        { name: 'PackBlock', data: makeZip([{ name: '1', data: toc }]) }
    ]);
}

function testBookHbk() {
    const reader = loadModule('src/help/hbk-reader.js');
    const builder = loadModule('src/help/package_builder.js');
    [
        { book: 'SyntaxHelperQueries', kind: 'query', page: 'SELECT', title: 'ВЫБРАТЬ' },
        { book: 'dcsui', kind: 'dcs', page: 'SKD_Lang', title: 'Язык выражений СКД' }
    ].forEach(item => {
        const parsed = reader.readHbk(makeBookHbk(item.book, item.page, item.title));
        assert.equal(parsed.kind, item.kind);
        assert.equal(parsed.toc.roots[0].kind, item.kind);
        const candidate = builder.createTocLazyCandidate(parsed, 1);
        assert.equal(candidate.navigation.length, 1, 'технический корень книги скрывается');
        assert.equal(candidate.navigation[0].title, item.title);
        builder.indexPackage(candidate);
        assert(candidate.pages[`${item.kind}:${item.page}`], 'страница без расширения индексируется');
        assert.equal(candidate.pageCount, 1, '__categories__ не считается страницей');
    });
}

function testNativeIndex() {
    const native = loadModule('src/help/native_index.js');
    const text = '{1,{1,1,1,"#",0,0,"ru",0,0,"ru","Строка",0,1,0,1,"/page.html"}}';
    const indexPack = makeZip([{ name: '0', data: Buffer.from('\ufeff' + text) }]);
    const main = Buffer.alloc(8); main.writeUInt32LE(2, 0);
    const lookup = Buffer.alloc(8); lookup.writeUInt32LE(7, 0);
    const parsed = native.parseNativeIndex({ IndexPackBlock: indexPack, MainData: main, PackLookup: lookup });
    assert.equal(parsed.records.length, 1);
    assert.deepEqual(parsed.records[0].names, [{ language: 'ru', value: 'Строка' }]);
    assert.deepEqual(parsed.records[0].paths, ['page.html']);
    assert.deepEqual(parsed.lookup, [7]);
    const dcsPage = { id: 'dcs:page.html', kind: 'dcs', path: 'page.html', title: 'Страница' };
    assert.deepEqual(native.nativePrefixItems(parsed, { 'dcs:page.html': dcsPage }, 'dcs')[0], {
        id: dcsPage.id, kind: 'dcs', path: 'page.html', title: 'Строка', context: '', alias: 'ru'
    });
}

function testLoadingStrategies() {
    const zip = loadModule('src/help/zip.js');
    const toc = loadModule('src/help/toc.js');
    const builder = loadModule('src/help/package_builder.js');
    const strategies = loadModule('src/help/benchmark_strategies.js');
    const storage = zip.readZip(makeZip([
        { name: 'objects/String.html', data: '<html><h1 class="V8SH_pagetitle">Строка</h1><p>Unicode ёлка</p></html>' },
        { name: 'objects/Number.html', data: '<html><h1 class="V8SH_pagetitle">Число</h1><p>Числовое значение</p></html>' }
    ]));
    const tree = toc.parseToc(tocSource([
        tocNode(1, 0, [], 'Строка', 'String', 'objects/String.html'),
        tocNode(2, 0, [], 'Число', 'Number', 'objects/Number.html')
    ]));
    const summaries = ['eager-html', 'toc-lazy', 'native-index-lazy'].map(strategy => {
        const candidate = strategies.createBenchmarkCandidate({ kind: 'context', storage, toc: tree, entities: {} }, strategy);
        if (strategy != 'eager-html') assert.equal(candidate.pageCount, 2, strategy + ' готовит каталог без HTML');
        builder.indexPackage(candidate);
        return {
            pages: candidate.pageCount,
            documents: candidate.documents.map(item => item.id).sort(),
            index: candidate.index.map(item => item.item.id + ':' + item.item.title).sort()
        };
    });
    assert.deepEqual(summaries[1], summaries[0]);
    assert.deepEqual(summaries[2], summaries[0]);

    const technicalStorage = zip.readZip(makeZip([
        { name: 'objects/catalog1.html', data: '<html><h1 class="V8SH_pagetitle">Корневой раздел</h1></html>' },
        { name: 'objects/catalog1/catalog2.html', data: '<html><h1 class="V8SH_pagetitle">Дочерний раздел</h1></html>' }
    ]));
    const technicalTree = toc.parseToc(tocSource([
        tocNodeNoNames(1, 0, [2], 'objects/catalog1.html'),
        tocNodeNoNames(2, 1, [], 'objects/catalog1/catalog2.html')
    ]));
    const hydrated = builder.createTocLazyCandidate({
        kind: 'context', storage: technicalStorage, toc: technicalTree, entities: {}
    }, 17);
    assert.equal(hydrated.navigation[0].title, 'Корневой раздел', 'корень гидратируется до prepared');
    assert.equal(hydrated.navigation[0].children[0].title, 'catalog2', 'невидимый уровень остаётся ленивым');
    const children = builder.hydrateNavigationChildren(hydrated, 'context:1');
    assert.equal(children[0].title, 'Дочерний раздел', 'видимые дети гидратируются при раскрытии');
    assert.strictEqual(builder.hydrateNavigationChildren(hydrated, 'context:1'), children,
        'повторное раскрытие использует кэш поколения');
}

function tocNode(id, parent, children, ru, en, html) {
    return `{${id},${parent},${children.length}${children.map(x => ',' + x).join('')},{1,1,{1,2,{"ru","${ru}"},{"en","${en}"}},"${html}"}}`;
}

function tocNodeNoNames(id, parent, children, html) {
    return `{${id},${parent},${children.length}${children.map(x => ',' + x).join('')},{1,1,{1,0},"${html}"}}`;
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
    assert.equal(parseToc(source, 'query').roots[0].id, 'query:1');
    assert.equal(parseToc(source, 'query').roots[0].kind, 'query');
    const hashTitle = parseToc('{1,{1,0,0,{1,1,{1,1,{"#","Заголовок"}},"page"}}}', 'query');
    assert.equal(hashTitle.roots[0].title, 'Заголовок', 'общие книги используют язык # в TOC');
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
    assert.equal(navigation.inferGroupTitle({ title: 'Методы', children: [
        { path: 'objects/Owner/methods/Call.html' }
    ] }), 'Методы', 'заданный TOC-заголовок не мешает распознать группу');
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
            id: 'context:3', title: 'Методы', path: '', children: [{
                id: 'context:4', title: 'Выбрать', path: page.path, kind: 'context', children: []
            }]
        }]
    }]}];
    navigation.decorateContextNavigation(roots, pages);
    const group = roots[0].children[0].children[0];
    const leaf = group.children[0];
    assert.equal(group.title, 'Методы');
    assert.equal(group.systemGroup, true, 'группа из TOC отделяется от владельца');
    assert.equal(page.context, 'СправочникМенеджер.<Имя справочника>/Методы/Выбрать');
    assert.equal(leaf.tocId, 'context:4');
    assert.equal(leaf.id, page.id, 'TOC id заменяется идентификатором статьи');
    assert.equal(navigation.resolvePage(pages, 'context', page.path, 'context:4'), page,
        'при неизвестном TOC id статья находится по kind + path');

    const byId = navigation.findNavigationPath(roots, {
        id: page.id, kind: 'context', path: 'objects/другой.html'
    });
    assert.deepEqual(byId.map(node => node.tocId || node.id),
        ['context:1', 'context:2', 'context:3', 'context:4'], 'page id имеет приоритет над путём');
    const byPath = navigation.findNavigationPath(roots, {
        id: 'context:missing', kind: 'context', path: 'objects\\catalog\\object\\methods\\Select.html'
    });
    assert.equal(byPath[byPath.length - 1], leaf, 'fallback нормализует путь статьи');
    assert.equal(navigation.findNavigationPath(roots, {
        id: page.id, kind: 'query', path: page.path
    }), null, 'пакеты разных видов не смешиваются');
    assert.equal(navigation.findNavigationPath(roots, {
        id: 'context:missing', kind: 'context', path: 'objects/missing.html'
    }), null, 'отсутствующая статья не даёт ложного пути');
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
    assert.deepEqual(links.resolveHelpLink('v8help://SyntaxHelperQueries/SELECTSection#fields', current), {
        type: 'internal', kind: 'query', path: 'SELECTSection', anchor: 'fields'
    });
    assert.deepEqual(links.resolveHelpLink('v8help://dcsui/SKD_Lang', current), {
        type: 'internal', kind: 'dcs', path: 'SKD_Lang', anchor: ''
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

    const nativeAtob = global.atob;
    global.atob = function () { throw new Error('atob недоступен'); };
    try {
        assert.deepEqual(Array.from(base64.decodeBase64('AAEC/f7/')), [0, 1, 2, 253, 254, 255], 'работает ручной fallback');
    }
    finally {
        global.atob = nativeAtob;
    }
}

function testIndexWorker() {
    const originalSelf = global.self;
    const messages = [];
    global.self = { postMessage(message) { messages.push(message); } };
    try {
        loadModule('src/help/index_worker.js');
        const html = Buffer.from('<html><h1 class="V8SH_pagetitle">Параллельная статья</h1><p>строка</p></html>');
        const descriptor = {
            offset: 0, length: html.length, compressedSize: html.length, uncompressedSize: html.length,
            method: 0, crc: crc32(html), name: 'page.html', page: true,
            id: 'context:page.html', kind: 'context', path: 'page.html',
            title: 'page', fallbackTitle: 'page', alias: '', ordinal: 42
        };
        global.self.onmessage({ data: { type: 'index-begin', generation: 1, kind: 'context' } });
        const buffer = Uint8Array.from(html).buffer;
        global.self.onmessage({ data: {
            type: 'index-batch', requestId: 7, generation: 1, kind: 'context', batchId: 3,
            entries: [descriptor], buffer: buffer
        } });
        assert.equal(messages.pop().payload.pages[0].title, 'Параллельная статья');
        global.self.onmessage({ data: { type: 'index-commit', requestId: 7, generation: 1, kind: 'context' } });
        assert.equal(messages.pop().type, 'index-commit-result');
        global.self.onmessage({ data: { type: 'search', searchId: 9, query: 'строка', limit: 1000 } });
        const search = messages.pop().payload.result;
        assert.equal(search.total, 1);
        assert.equal(search.items[0].ordinal, 42, 'ordinal передаётся для стабильного слияния');
        global.self.onmessage({ data: { type: 'index-finalize', generation: 1 } });

        const replacement = Buffer.from('<html><h1 class="V8SH_pagetitle">Замена</h1><p>другое</p></html>');
        global.self.onmessage({ data: { type: 'index-begin', generation: 3, kind: 'context' } });
        global.self.onmessage({ data: {
            type: 'index-batch', requestId: 10, generation: 3, kind: 'context', batchId: 5,
            entries: [Object.assign({}, descriptor, {
                length: replacement.length, compressedSize: replacement.length,
                uncompressedSize: replacement.length, crc: crc32(replacement)
            })], buffer: Uint8Array.from(replacement).buffer
        } });
        messages.pop();
        global.self.onmessage({ data: { type: 'index-commit', requestId: 10, generation: 3, kind: 'context' } });
        messages.pop();
        global.self.onmessage({ data: { type: 'index-cancel', generation: 3 } });
        global.self.onmessage({ data: { type: 'search', searchId: 11, query: 'строка', limit: 1000 } });
        assert.equal(messages.pop().payload.result.total, 1, 'отмена staged-поколения восстанавливает прежний корпус');

        global.self.onmessage({ data: { type: 'index-begin', generation: 2, kind: 'context' } });
        global.self.onmessage({ data: {
            type: 'index-batch', requestId: 8, generation: 2, kind: 'context', batchId: 4,
            entries: [Object.assign({}, descriptor, { crc: 0 })], buffer: Uint8Array.from(html).buffer
        } });
        assert.equal(messages.pop().type, 'index-error', 'CRC-ошибка отменяет пакет worker');
    }
    finally {
        global.self = originalSelf;
    }
}

function testIndexBatching() {
    const originalSelf = global.self;
    global.self = { postMessage() {} };
    try {
        const worker = loadModule('src/help/help_worker.js');
        const entrySize = 4 * 1024;
        const entries = Array.from({ length: 130 }, (_, index) => ({
            name: 'page' + index + '.html', dataOffset: index * entrySize,
            compressedSize: entrySize, uncompressedSize: entrySize,
            method: 0, crc: 0
        }));
        const candidate = {
            kind: 'context', cursor: 0, pages: {},
            storage: { entries, data: new Uint8Array(entries.length * entrySize) }
        };
        const first = worker.buildIndexBatch(candidate);
        assert.equal(first.entries.length, 128, 'пакет ограничен 128 ZIP-записями');
        assert.equal(first.buffer.byteLength, 512 * 1024, 'пакет не превышает 512 КиБ');
        const second = worker.buildIndexBatch(candidate);
        assert.equal(second.entries.length, 2);
        assert(second.buffer.byteLength <= 512 * 1024);

        const sizes = [400 * 1024, 100 * 1024, 20 * 1024];
        let offset = 0;
        const byteEntries = sizes.map((size, index) => {
            const entry = { name: 'size' + index, dataOffset: offset, compressedSize: size,
                uncompressedSize: size, method: 0, crc: 0 };
            offset += size;
            return entry;
        });
        const byteCandidate = { kind: 'context', cursor: 0, pages: {},
            storage: { entries: byteEntries, data: new Uint8Array(offset) } };
        assert.equal(worker.buildIndexBatch(byteCandidate).buffer.byteLength, 500 * 1024,
            'лимит байтов завершает пакет до переполнения');
        assert.equal(worker.buildIndexBatch(byteCandidate).buffer.byteLength, 20 * 1024);
    }
    finally {
        global.self = originalSelf;
    }
}

async function testPoolOrderingAndGenerations() {
    const serviceModule = loadModule('src/help/service.js', source => source
        .replace(/const workerUrl = require\([^\n]+\);/, "const workerUrl = 'fake';")
        .replace(/const indexWorkerUrl = require\([^\n]+\);/, "const indexWorkerUrl = 'fake';"));
    let workerNumber = 0;
    class SearchWorker {
        constructor() { this.number = workerNumber++; }
        postMessage(message) {
            if (message.type != 'search') return;
            const number = this.number;
            setTimeout(() => this.onmessage({ data: { type: 'search-result', payload: {
                searchId: message.searchId,
                result: { total: 1, terms: ['x'], items: [{
                    id: 'page' + number, title: 'Одинаковый заголовок', path: 'page' + number,
                    kind: 'context', score: 100, ordinal: number ? 1 : 2
                }] }
            } } }), number ? 0 : 5);
        }
        terminate() {}
    }
    const orderedService = serviceModule.createHelpService(() => ({
        postMessage() {}, terminate() {}
    }), () => new SearchWorker(), 2);
    const search = await orderedService.search('x');
    assert.deepEqual(search.items.map(item => item.ordinal), [1, 2],
        'ответы workers вне порядка объединяются по стабильному ordinal');
    orderedService.dispose();

    class GenerationWorker {
        postMessage(message) {
            if (message.type == 'parse') setImmediate(() => this.onmessage({ data: {
                id: message.id, type: 'parsed', payload: {
                    kind: 'context', generation: 2, pages: 1,
                    navigation: [{ id: 'context:root', tocId: 'context:root', kind: 'context',
                        title: 'Корень', children: [{}] }], index: [], stats: {}
                }
            } }));
            else if (message.type == 'navigation-children') setImmediate(() => this.onmessage({ data: {
                id: message.id, type: 'navigation-children', payload: {
                    kind: 'context', generation: 1, tocId: message.tocId, children: []
                }
            } }));
        }
        terminate() {}
    }
    const generationService = serviceModule.createHelpService(() => new GenerationWorker());
    assert.equal((await generationService.parse(blob('context', 1))).ok, true);
    await assert.rejects(generationService.hydrate(generationService.getNavigation()[0]), /Поколение справки изменилось/,
        'ответ гидратации прошлого поколения игнорируется');
    generationService.dispose();
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
    constructor() {
        this.messages = [];
        this.activeTransfer = null;
        this.readyTransfer = null;
        this.transferEnded = false;
        this.transferError = null;
    }

    postMessage(message) {
        this.messages.push(message);
        if (message.type === 'transfer-begin') {
            this.activeTransfer = { name: message.name, chunks: [] };
            this.transferEnded = false;
            this.transferError = null;
            return;
        }
        if (message.type === 'transfer-push') {
            if (message.chunk.indexOf('$') >= 0) this.transferError = 'Некорректная строка Base64';
            else this.activeTransfer.chunks.push(message.chunk);
            return;
        }
        if (message.type === 'transfer-end') {
            if (!this.transferError) this.readyTransfer = this.activeTransfer;
            this.activeTransfer = null;
            this.transferEnded = true;
            return;
        }
        if (message.type === 'parse-transferred') {
            const captured = this.readyTransfer;
            const error = this.transferError;
            return setImmediate(() => {
                if (!this.transferEnded || !captured || error)
                    return this.onmessage({ data: { id: message.id, type: 'error', payload: { message: error || 'Нет завершённой передачи Base64' } } });
                const kind = captured.name === 'shcntx' ? 'context' : 'language';
                this.onmessage({ data: { id: message.id, type: 'parsed', payload: {
                    kind, pages: captured.chunks.length, navigation: [{ kind, title: kind, children: [] }],
                    index: [{ key: kind, item: { kind, title: kind, path: kind } }], stats: {}
                } } });
            });
        }
        setImmediate(() => {
            if (message.type === 'parse') {
                const source = message.source;
                if (source.fail) return this.onmessage({ data: {
                    id: message.id, type: 'error', payload: { message: 'broken', kind: source.kind }
                } });
                const kind = typeof source === 'string' ? 'language' : source.kind;
                const payload = {
                    kind, pages: typeof source === 'string' ? 3 : source.pages,
                    navigation: [{ kind, title: kind, children: [] }],
                    index: [{ key: kind, item: { kind, title: kind, path: kind } }], stats: {}
                };
                if (source.staged) {
                    this.onmessage({ data: { id: message.id, type: 'prepared', payload } });
                    return setTimeout(() => {
                        if (source.failAfter) {
                            this.onmessage({ data: { id: message.id, type: 'rollback', payload: { kind } } });
                            this.onmessage({ data: { id: message.id, type: 'error', payload: { message: 'late CRC' } } });
                        }
                        else this.onmessage({ data: { id: message.id, type: 'parsed', payload } });
                    }, 10);
                }
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

function blob(kind, pages, fail, staged, failAfter) { return { kind, pages, fail, staged, failAfter, size: 1, slice() {} }; }

async function testService() {
    const serviceModule = loadModule('src/help/service.js', source => source
        .replace(/const workerUrl = require\([^\n]+\);/, "const workerUrl = 'fake';")
        .replace(/const indexWorkerUrl = require\([^\n]+\);/, "const indexWorkerUrl = 'fake';"));
    async function order(first, second) {
        const service = serviceModule.createHelpService(() => new FakeWorker());
        assert.equal((await service.parse(blob(first, 1))).ok, true);
        assert.equal((await service.parse(blob(second, 2))).ok, true);
        assert(service.getState().packages.context);
        assert(service.getState().packages.language);
    }
    await order('context', 'language');
    await order('language', 'context');
    const allKinds = serviceModule.createHelpService(() => new FakeWorker());
    for (const kind of ['context', 'language', 'query', 'dcs'])
        assert.equal((await allKinds.parse(blob(kind, 1))).kind, kind);
    allKinds.setKinds(['query']);
    assert.equal(allKinds.prefix('', 1000).items[0].kind, 'query');
    assert.deepEqual(allKinds.getNavigation().map(item => item.kind), ['query']);
    allKinds.setKinds(['dcs']);
    assert.equal(allKinds.isReady(), true);
    const failedQuery = await allKinds.parse(blob('query', 1, true));
    assert.equal(failedQuery.ok, false);
    assert.equal(allKinds.isReady(), true, 'ошибка query не блокирует активный dcs');
    allKinds.setKinds(['query']);
    assert.equal(allKinds.isReady(), false, 'ошибка блокирует только свой режим');
    allKinds.setKinds(['context', 'language']);
    assert.equal(allKinds.isReady(), true, 'базовая справка остаётся готовой');
    allKinds.dispose();
    let poolAttempts = 0;
    let fallbackCoordinator = null;
    const fallbackService = serviceModule.createHelpService(() => (fallbackCoordinator = new FakeWorker()), () => {
        poolAttempts++;
        throw new Error('worker недоступен');
    }, 2);
    const fallbackParse = fallbackService.parse(blob('context', 1, false, true));
    await new Promise(resolve => setImmediate(resolve));
    fallbackCoordinator.onmessage({ data: {
        type: 'index-begin', payload: { requestId: 1, generation: 1 }
    } });
    assert.equal((await fallbackParse).ok, true,
        'ошибка создания пула оставляет однопоточный fallback');
    assert.equal(poolAttempts, 1);
    fallbackService.dispose();
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
    const staged = service.parse(blob('context', 30, false, true));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(service.isReady(), true, 'предварительный пакет доступен до полной проверки');
    assert.equal(service.getState().indexing, true);
    assert.equal(service.getState().packages.context.pages, 30);
    assert.equal((await staged).ok, true);
    assert.equal(service.getState().indexing, false);
    const lateFailure = service.parse(blob('context', 40, false, true, true));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(service.getState().packages.context.pages, 40, 'кандидат виден во время проверки');
    assert.equal((await lateFailure).ok, false);
    assert.equal(service.getState().packages.context.pages, 30, 'поздняя CRC-ошибка откатывает кандидат');
    const fromBase64 = await service.parse('AQID');
    assert.equal(fromBase64.ok, true);
    assert.equal(fromBase64.kind, 'language');
    const invalid = await service.parse({});
    assert.deepEqual(Object.keys(invalid).sort(), ['error', 'kind', 'ok', 'pages']);
    assert.equal(service.prefix('LANG', 1000).total, 1);

    const transferWorker = new FakeWorker();
    const transfers = serviceModule.createHelpService(() => transferWorker);
    assert.throws(() => transfers.beginTransfer(' '), /непустое имя/);
    assert.throws(() => transfers.pushTransfer('AQID'), /beginBase64Transfer/);
    assert.throws(() => transfers.endTransfer(), /Нет активной/);
    assert.equal((await transfers.parseTransferred()).error, 'Нет завершённой передачи Base64');

    transfers.beginTransfer('shlang');
    assert.throws(() => transfers.pushTransfer(1), /строку Base64/);
    transfers.pushTransfer('AQ$D'); // содержимое проверяется worker, а не основным потоком
    assert.equal((await transfers.parseTransferred()).error, 'Передача Base64 ещё не завершена');
    transfers.endTransfer();
    const malformed = await transfers.parseTransferred();
    assert.equal(malformed.ok, false);
    assert.match(malformed.error, /Некорректная/);
    assert.equal((await transfers.parseTransferred()).error, malformed.error, 'ошибка завершённой попытки повторяется');

    transfers.beginTransfer('abandoned');
    transfers.pushTransfer('AAAA');
    transfers.beginTransfer('shcntx'); // новая передача отменяет только незавершённую
    transfers.pushTransfer('AQID');
    transfers.pushTransfer('BAUG');
    transfers.endTransfer();
    const transferred = await transfers.parseTransferred();
    assert.equal(transferred.ok, true);
    assert.equal(transferred.kind, 'context');
    assert.equal(transferred.pages, 2);
    assert.equal((await transfers.parseTransferred()).pages, 2, 'успешная передача читается повторно');
    assert.deepEqual(transferWorker.messages.slice(-8).map(message => message.type), [
        'transfer-begin', 'transfer-push', 'transfer-begin', 'transfer-push',
        'transfer-push', 'transfer-end', 'parse-transferred', 'parse-transferred'
    ]);

    const crashWorker = new FakeWorker();
    const crashedTransfers = serviceModule.createHelpService(() => crashWorker);
    await crashedTransfers.parse(blob('context', 7));
    crashedTransfers.beginTransfer('shlang');
    crashedTransfers.pushTransfer('AQID');
    crashWorker.onerror({ message: 'worker упал' });
    const crashed = await crashedTransfers.parseTransferred();
    assert.equal(crashed.ok, false);
    assert.equal(crashed.error, 'worker упал');
    assert.equal(crashedTransfers.getState().packages.context.pages, 7, 'сбой worker сохраняет загруженный пакет');
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
    const workerLoader = 'x.exports=function(){return B(`self.onmessage = function () {};`,"Worker",void 0,void 0)}';
    assert.equal(checker.checkBlobWorkers(workerLoader, 'worker-loader.js'), 1);
    const bad = 'const worker = new Blob([\'class Broken { field; }\'], {type: \'application/javascript\'});';
    assert.throws(() => checker.checkBlobWorkers(bad, 'bad.js'), /ES2018/);
}

async function main() {
    testZip();
    testHbkBlocks();
    testBookHbk();
    testNativeIndex();
    testLoadingStrategies();
    testToc();
    testNavigation();
    testLinks();
    testSearch();
    testBase64();
    testIndexWorker();
    testIndexBatching();
    await testPoolOrderingAndGenerations();
    await testBase64Transfer();
    await testService();
    testUnknownHbk();
    testBlobWorkerCheck();
    console.log('All help browser unit checks passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
