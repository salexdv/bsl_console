// Тестовый скрипт для отладки проблем с подсветкой синтаксиса
document.addEventListener("DOMContentLoaded", function() {
    // Используем существующую функцию отладки токенизации
    const testCode = `
Процедура ТестоваяПроцедура()
    // Тестовый код
    Если Истина Тогда
        Сообщить("Тест");
    КонецЕсли;
КонецПроцедуры
    `;
    
    // Отладка токенизации
    const tokens = debugTokenization(testCode, 'bsl');
    console.log("Токены тестовой процедуры:", tokens);
    
    // Проверим конкретно токенизацию конца функции
    const endFuncTest = `КонецПроцедуры`;
    const endFuncTokens = debugTokenization(endFuncTest, 'bsl');
    console.log("Токены конца процедуры:", endFuncTokens);
});
