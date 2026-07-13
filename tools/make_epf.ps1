# Пересборка .epf-обёртки консоли с новым single-file HTML — доставка полевого гейта спайка.
#
# Механика (выяснено разбором console-single-b.epf, 2026-07-13): форма читает макет "single"
# (тип BinaryData, RAW UTF-8 HTML, БЕЗ сжатия — V8-контейнер жмёт сам) в ЭтотОбъект.HTML.
# Обход предупреждения 1С 8.3.27+ об открытии локального файла (HTML грузится текстом).
# Разбор/сборка — конфигуратор (иерархический Dump → правка макета → Load из корневого xml).
#
# Использование (нужен установленный 1С 8.3.x; Node не нужен):
#   powershell -ExecutionPolicy Bypass -File tools\make_epf.ps1 [-Html <..>] [-Template <..epf>] [-Out <..epf>]
# По умолчанию: dist\index.html  →  Desktop\console-single-b.epf (шаблон)  →  Desktop\console-single-b-monaco055.epf
#
# ПРИМ.: запускать с отключённым sandbox (нужен запуск конфигуратора). Внутри скрипта Remove-Item
# не используется рядом с C:\Program (иначе срабатывает защитный guard среды).

param(
  [string]$Html = "$PSScriptRoot\..\dist\index.html",
  [string]$Template = "$env:USERPROFILE\Desktop\console-single-b.epf",
  [string]$Out = "$env:USERPROFILE\Desktop\console-single-b-monaco055.epf"
)
$ErrorActionPreference = "Stop"

# 1. Последний установленный конфигуратор 1С 8.3.x.
$exe = Get-ChildItem "C:\Program Files\1cv8","C:\Program Files (x86)\1cv8" -Recurse -Filter 1cv8.exe -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $exe) { throw "Не найден 1cv8.exe (1С:Предприятие 8.3)" }
if (-not (Test-Path $Html)) { throw "Нет HTML: $Html (сначала npm run build:single)" }
if (-not (Test-Path $Template)) { throw "Нет шаблона .epf: $Template" }

$work = Join-Path $env:TEMP "bsl_make_epf"
$ib = Join-Path $work "ib"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$dump = Join-Path $work "dump-$stamp"
New-Item -ItemType Directory -Force -Path $ib, $dump | Out-Null

# 2. Пустая файловая ИБ для контекста конфигуратора (один раз).
if (-not (Test-Path (Join-Path $ib "1Cv8.1CD"))) {
  Start-Process -FilePath $exe -ArgumentList @("CREATEINFOBASE", "File=$ib", "/DisableStartupDialogs", "/DisableStartupMessages") -Wait -WindowStyle Hidden | Out-Null
}

# 3. Разобрать шаблон .epf в XML (иерархически).
$dumpLog = Join-Path $work "dump.log"
$pd = Start-Process -FilePath $exe -ArgumentList @("DESIGNER", "/F$ib", "/DumpExternalDataProcessorOrReportToFiles", "$dump", "$Template", "/Out$dumpLog", "/DisableStartupDialogs", "/DisableStartupMessages") -Wait -PassThru -WindowStyle Hidden
if ($pd.ExitCode -ne 0) { Get-Content $dumpLog -ErrorAction SilentlyContinue; throw "Dump .epf упал (exit $($pd.ExitCode))" }

# 4. Найти корневой xml объекта с макетом single.
$rootXml = Get-ChildItem $dump -Filter *.xml -File | Where-Object { Test-Path (Join-Path $dump "$($_.BaseName)\Templates\single\Ext\Template.bin") } | Select-Object -First 1
if (-not $rootXml) { throw "В дампе не найден объект с макетом single" }

# 5. Вложить новый HTML в макет single (RAW UTF-8, без сжатия).
$single = Join-Path $dump "$($rootXml.BaseName)\Templates\single\Ext\Template.bin"
Copy-Item $Html $single -Force
$hdr = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($single)[0..14])
Write-Host "макет single: '$hdr' ($([math]::Round((Get-Item $single).Length/1MB,2)) MB)"

# 6. Собрать обратно в .epf (Load из КОРНЕВОГО xml иерархического дампа — не из каталога).
$tmpEpf = Join-Path $work "out-$stamp.epf"
$loadLog = Join-Path $work "load.log"
$pl = Start-Process -FilePath $exe -ArgumentList @("DESIGNER", "/F$ib", "/LoadExternalDataProcessorOrReportFromFiles", "$($rootXml.FullName)", "$tmpEpf", "/Out$loadLog", "/DisableStartupDialogs", "/DisableStartupMessages") -Wait -PassThru -WindowStyle Hidden
if ($pl.ExitCode -ne 0 -or -not (Test-Path $tmpEpf)) { Get-Content $loadLog -ErrorAction SilentlyContinue; throw "Load .epf упал (exit $($pl.ExitCode))" }

# 7. Доставить (Copy-Item -Force, без Remove-Item).
Copy-Item $tmpEpf $Out -Force
Write-Host "OK: $Out ($([math]::Round((Get-Item $Out).Length/1MB,2)) MB)"
