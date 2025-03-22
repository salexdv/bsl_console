// Настраиваем окружение Monaco Editor
window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        // Создаем Blob URL для каждого worker типа
        let workerUrl = './vs/editor/editor.worker.js';
        
        // В Monaco 0.52.0 используется другой подход к загрузке worker файлов
        // Используем технику с Blob URL для надежной работы
        return URL.createObjectURL(new Blob([
            'self.MonacoEnvironment = { baseUrl: "." };\n' +
            'importScripts("./vs/base/worker/workerMain.js");'
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