// Источник: синтакс-помощник 1С 8.3.27.2342, shcntx_ru.hbk, раздел tables.
// Сигнатуры таблиц языка запросов отличаются от методов менеджеров регистров.
const momentType = 'Дата | МоментВремени | Граница';
const accountingMomentType = 'Дата | МоментВремени | МоментВремениСУточнениемПериода | Граница';
const expressionType = 'Конструкция языка запросов';
const dimensionsType = 'Массив | СписокЗначений';
const extDimensionsType = 'ПланВидовХарактеристикСсылка | Массив | ФиксированныйМассив | СписокЗначений';

function parameter(name, nameEn, type, description) {
    return { name: name, nameEn: nameEn, type: type, description: description };
}

const begin = parameter('НачалоПериода', 'BeginOfPeriod', momentType,
    'Начало интервала, за который выбираются данные. Если не задано, нижняя граница не ограничена.');
const end = parameter('КонецПериода', 'EndOfPeriod', momentType,
    'Конец интервала, за который выбираются данные. Если не задан, верхняя граница не ограничена.');
const accountingBegin = parameter('НачалоПериода', 'BeginOfPeriod', accountingMomentType, begin.description);
const accountingEnd = parameter('КонецПериода', 'EndOfPeriod', accountingMomentType, end.description);
const period = parameter('Период', 'Period', momentType,
    'Момент времени, на который рассчитываются остатки. Без параметра рассчитываются текущие итоги.');
const periodicity = parameter('Периодичность', 'Periodicity', expressionType,
    'Разворот по периодам: Период, Запись, Регистратор, Секунда, Минута, Час, День, Неделя, Декада, Месяц, Квартал, Полугодие, Год, Авто. По умолчанию — Период.');
const accountingPeriodicity = parameter('Периодичность', 'Periodicity', expressionType,
    periodicity.description + ' Для регистра с уточнением периода также доступно УточнениеПериода.');
const complement = parameter('МетодДополнения', 'ComplementMethod', expressionType,
    'Движения — периоды с движениями; ДвиженияИГраницыПериода — также границы периода с ненулевыми остатками. По умолчанию — ДвиженияИГраницыПериода.');
const condition = parameter('Условие', 'Condition', expressionType,
    'Условие отбора исходных записей регистра до расчёта результата виртуальной таблицы.');
const accountCondition = parameter('УсловиеСчета', 'AccountCondition', expressionType,
    'Условие отбора счетов; в выражении используется поле Счет.');
const extDimensions = parameter('Субконто', 'ExtDimensions', extDimensionsType,
    'Виды субконто и их порядок. Выбираются счета, имеющие все указанные виды субконто. Без параметра субконто определяются позиционно.');
const order = parameter('Порядок', 'Order', expressionType,
    'Поля сортировки записей и направления ВОЗР или УБЫВ.');
const top = parameter('Первые', 'Top', 'Число', 'Максимальное количество выбираемых записей. По умолчанию 0 — без ограничения.');

function table(name, nameEn, parameters, alternatives) {
    return { name: name, nameEn: nameEn, variants: [parameters].concat(alternatives || []) };
}

const registers = [
    {
        name: 'РегистрСведений', nameEn: 'InformationRegister',
        tables: [
            table('СрезПервых', 'SliceFirst', [parameter('Период', 'Period', momentType,
                'Нижняя граница поиска наиболее ранних записей (включительно). Без параметра выбираются наиболее ранние записи без ограничения по дате.'), condition]),
            table('СрезПоследних', 'SliceLast', [parameter('Период', 'Period', momentType,
                'Верхняя граница поиска наиболее поздних записей (включительно). Без параметра выбираются наиболее поздние записи без ограничения по дате.'), condition])
        ]
    },
    {
        name: 'РегистрНакопления', nameEn: 'AccumulationRegister',
        tables: [
            table('Остатки', 'Balance', [period, condition]),
            table('Обороты', 'Turnovers', [begin, end, periodicity, condition]),
            table('ОстаткиИОбороты', 'BalanceAndTurnovers', [begin, end, periodicity, complement, condition])
        ]
    },
    {
        name: 'РегистрБухгалтерии', nameEn: 'AccountingRegister',
        tables: [
            table('Остатки', 'Balance', [parameter('Период', 'Period', accountingMomentType, period.description), accountCondition, extDimensions, condition]),
            table('Обороты', 'Turnovers', [accountingBegin, accountingEnd, accountingPeriodicity, accountCondition, extDimensions, condition,
                parameter('УсловиеКорСчета', 'BalancedAccountCondition', expressionType, 'Условие отбора корреспондирующих счетов по полю КорСчет.'),
                parameter('КорСубконто', 'BalancedExtDimensions', 'ПланВидовХарактеристикСсылка | Массив | Неопределено', 'Виды и порядок субконто корреспондирующего счета.')],
            [[accountingBegin, end, accountingPeriodicity, accountCondition, extDimensions, condition]]),
            table('ОстаткиИОбороты', 'BalanceAndTurnovers', [accountingBegin, end, accountingPeriodicity, complement, accountCondition, extDimensions, condition]),
            table('ОборотыДтКт', 'DrCrTurnovers', [accountingBegin, accountingEnd, accountingPeriodicity,
                parameter('УсловиеСчетаДт', 'AccountDrCondition', expressionType, 'Условие отбора по полю СчетДт.'),
                parameter('СубконтоДт', 'ExtDimensionsDr', extDimensionsType, 'Виды и порядок субконто дебетуемых счетов.'),
                parameter('УсловиеСчетаКт', 'AccountCrCondition', expressionType, 'Условие отбора по полю СчетКт.'),
                parameter('СубконтоКт', 'ExtDimensionsCr', extDimensionsType, 'Виды и порядок субконто кредитуемых счетов.'), condition]),
            table('ДвиженияССубконто', 'RecordsWithExtDimensions', [accountingBegin, accountingEnd, condition, order, top])
        ]
    },
    {
        name: 'РегистрРасчета', nameEn: 'CalculationRegister',
        tables: [
            table('ДанныеГрафика', 'ScheduleData', [condition]),
            table('ФактическийПериодДействия', 'AdjustedEffectivePeriod', [condition]),
            table('База', 'Base', [
                parameter('ИзмеренияОсновногоРегистра', 'MainRegisterDimensions', dimensionsType,
                    'Обязательный параметр. Имена измерений основного регистра для сопоставления с измерениями базового регистра.'),
                parameter('ИзмеренияБазовогоРегистра', 'BaseRegisterDimensions', dimensionsType,
                    'Обязательный параметр. Имена измерений базового регистра в порядке соответствующих измерений основного регистра.'),
                parameter('Разрезы', 'ViewPoints', dimensionsType,
                    'Имена полей базового регистра для дополнительной группировки базовых данных.'), condition])
        ]
    }
];

// Полное трёхчастное имя исключает совпадения с BSL-методами и обычными функциями.
export function getQueryVirtualTableSignature(context) {
    const parts = context.methodName.split('.');
    if (parts.length != 3 || !parts[1])
        return null;

    const register = registers.find(function (item) {
        return item.name.toLowerCase() == parts[0].toLowerCase() || item.nameEn.toLowerCase() == parts[0].toLowerCase();
    });
    if (!register)
        return null;

    const name = parts[2].toLowerCase();
    const definition = register.tables.find(function (item) {
        if (register.name == 'РегистрРасчета' && item.name == 'База')
            return /^(база|base)[a-zа-яё_][a-zа-яё_0-9]*$/i.test(name);
        return item.name.toLowerCase() == name || item.nameEn.toLowerCase() == name;
    });
    if (!definition)
        return null;

    const english = definition.nameEn.toLowerCase() == name || (definition.name == 'База' && /^base/i.test(name));
    const signatures = definition.variants.map(function (parameters) {
        // Полное имя регистра длинное: параметры начинаются с новой строки,
        // чтобы активный аргумент был виден в штатном окне без прокрутки вправо.
        let label = parts.join('.') + '(\n';
        const result = parameters.map(function (param, index) {
            if (index)
                label += ', ';
            const start = label.length;
            const paramName = english ? param.nameEn : param.name;
            label += paramName;
            return {
                label: [start, label.length],
                documentation: { value: '**' + paramName + '**\n\nТип: ' + param.type + '\n\n' + param.description }
            };
        });
        return { label: label + ')', parameters: result };
    });

    const previous = context.activeSignatureHelp ? context.activeSignatureHelp.activeSignature : 0;
    let activeSignature = previous < signatures.length ? previous : 0;
    if (context.activeParameter >= signatures[activeSignature].parameters.length)
        activeSignature = signatures.findIndex(function (signature) { return context.activeParameter < signature.parameters.length; });
    if (activeSignature < 0)
        return null;
    return { activeSignature: activeSignature, activeParameter: context.activeParameter, signatures: signatures };
}
