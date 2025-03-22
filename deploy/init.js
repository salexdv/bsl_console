// Настраиваем окружение Monaco Editor
// Примечание: основная конфигурация перенесена в monaco-fix.js для лучшей совместимости с Cloudflare

// Загружаем редактор с учетом размещения на Cloudflare
require(['vs/editor/editor.main'], function() {
    console.log('Monaco editor loaded successfully');
    
    // Проверка, что все ресурсы загружены правильно
    if (typeof monaco !== 'undefined') {
        // Теперь загружаем наш редактор
        require(['editor'], {});
    } else {
        console.error('Monaco не был загружен корректно');
    }
});