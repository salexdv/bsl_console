// monaco 0.55: contrib/clipboard paste-действие (editor.action.clipboardPasteAction)
// в своём run() вызывает accessor.get(IProductService). Но standalone-сборка monaco
// этот сервис НЕ регистрирует → InstantiationService бросает «unknown service
// 'productService'», run падает РАНЬШЕ чтения буфера обмена, и «Вставить» не вставляет.
// До 0.55 paste productService не трогал — отсюда регрессия после апгрейда.
//
// Регистрируем минимальную реализацию: paste использует только .quality ('stable' →
// ветка телеметрии пропускается). Делаем это ДО инициализации StandaloneServices
// (импорт в boot.js идёт сразу после полифилов), иначе дескриптор не попадёт в реестр.
//
// Перенос из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid), src/product-service.ts.
import { registerSingleton } from 'monaco-editor/esm/vs/platform/instantiation/common/extensions';
import { IProductService } from 'monaco-editor/esm/vs/platform/product/common/productService';

class StandaloneProductService {
  constructor() {
    this.quality = 'stable';
  }
}

// 3-й аргумент — InstantiationType.Delayed (1): создаём сервис лениво, только когда
// его действительно запросят (первый paste).
registerSingleton(IProductService, StandaloneProductService, 1 /* InstantiationType.Delayed */);
