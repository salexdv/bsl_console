// Скрипт для отладки подсветки синтаксиса BSL кода
// Добавьте его в ваш HTML после загрузки основных скриптов

(function() {
    // Проверяем, загружен ли monaco
    if (typeof monaco === 'undefined') {
        console.error('Monaco еще не загружен!');
        return;
    }

    // Функция для сравнения токенизации с разными вариантами завершения функции
    function compareTokenization() {
        // Код без конца функции
        const incompleteCode = `
Функция ТестоваяФункция()
    Перем а;
    а = 10;
    Возврат а;
`;

        // Код с завершенной функцией
        const completeCode = incompleteCode + `КонецФункции`;

        console.log('=== ТЕСТ ТОКЕНИЗАЦИИ ===');
        console.log('1. Токенизация незавершенного кода:');
        const tokensIncomplete = debugTokenization(incompleteCode, 'bsl');
        
        console.log('2. Токенизация завершенного кода:');
        const tokensComplete = debugTokenization(completeCode, 'bsl');

        // Анализируем последнюю строку с КонецФункции
        if (tokensComplete && tokensComplete.length > 0) {
            const lastLineTokens = tokensComplete[tokensComplete.length - 1];
            console.log('Токены последней строки (КонецФункции):', lastLineTokens);
            
            // Проверяем, правильно ли токенизируется слово "КонецФункции"
            if (lastLineTokens && lastLineTokens.length > 0) {
                const keywordToken = lastLineTokens[0];
                console.log('Тип токена "КонецФункции":', keywordToken.type);
                
                if (keywordToken.type !== 'keyword.bsl') {
                    console.error('ПРОБЛЕМА: "КонецФункции" не распознается как ключевое слово!');
                    console.log('Это может быть причиной поломки подсветки синтаксиса.');
                }
            }
        }
    }

    // Запускаем тест при загрузке страницы
    setTimeout(compareTokenization, 1000); // Даем время на инициализацию
})();
