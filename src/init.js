// Настраиваем окружение Monaco Editor
window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        // Используем Blob URL вместо физических путей к файлам
        return URL.createObjectURL(new Blob([
            'self.MonacoEnvironment = {' +
            '    baseUrl: "https://unpkg.com/monaco-editor@0.52.0/min"' +
            '};' +
            'importScripts("https://unpkg.com/monaco-editor@0.52.0/min/vs/base/worker/workerMain.js");'
        ], { type: 'text/javascript' }));
    },
    createTrustedTypesPolicy: function(policyName, policyOptions) {
        // Этот метод вызывается, когда Monaco пытается создать политику доверенных типов
        // Если TrustedTypes API доступен, создаем политику
        if (window.trustedTypes) {
            return window.trustedTypes.createPolicy(policyName, policyOptions);
        }
        // Иначе возвращаем простой объект, который позволяет Monaco продолжить работу
        return {
            createHTML: function(html) { return html; },
            createScript: function(script) { return script; },
            createScriptURL: function(scriptUrl) { return scriptUrl; }
        };
    }
};

// Загружаем редактор
require(['editor'], {});