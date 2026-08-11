function createHelpFileLoader(parse, show) {
  const panel = document.getElementById('help-file-loader');
  const input = document.getElementById('help-file-input');
  const loadButton = document.getElementById('help-file-load');
  const showButton = document.getElementById('help-file-show');
  const status = document.getElementById('help-file-status');
  if (!panel || !input || !loadButton || !showButton || !status)
    return { setTheme: function () {}, show: function () {} };

  function selectedFiles() {
    const result = [];
    for (let index = 0; index < input.files.length; index++) result.push(input.files[index]);
    return result;
  }

  function setBusy(busy) {
    input.disabled = busy;
    loadButton.disabled = busy || !input.files.length;
  }

  function setStatus(text) {
    status.textContent = text;
    status.title = text;
  }

  input.addEventListener('change', function () {
    const files = selectedFiles();
    loadButton.disabled = !files.length;
    setStatus(files.length
      ? 'Выбрано: ' + files.map(function (file) { return file.name; }).join(', ')
      : 'Выберите shcntx_*.hbk и/или shlang_*.hbk');
  });

  loadButton.addEventListener('click', function () {
    const files = selectedFiles();
    if (!files.length) return;
    setBusy(true);
    const results = [];

    function load(index) {
      if (files.length <= index) {
        setBusy(false);
        setStatus((results.every(function (item) { return item.ok; }) ? 'Готово: ' : 'Завершено: ')
          + results.map(function (item) { return item.text; }).join('; '));
        return;
      }
      const file = files[index];
      setStatus('Загрузка ' + (index + 1) + ' из ' + files.length + ': ' + file.name);
      parse(file).then(function (result) {
        results.push({
          ok: result.ok,
          text: file.name + ' — ' + (result.ok ? result.kind + ', страниц: ' + result.pages : 'ошибка: ' + result.error)
        });
      }).catch(function (error) {
        results.push({ ok: false, text: file.name + ' — ошибка: ' + (error && error.message || String(error)) });
      }).then(function () { load(index + 1); });
    }

    load(0);
  });

  showButton.addEventListener('click', function () { show(); });

  return {
    setTheme: function (theme) { panel.classList.toggle('dark', /dark|vs-dark/i.test(theme || '')); },
    show: function () { panel.hidden = false; }
  };
}

export { createHelpFileLoader };
