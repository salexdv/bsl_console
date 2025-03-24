# BSL Console Deployment Script
# This script copies all necessary files from src to deploy directory

$sourceDir = ".\src"
$destDir = ".\deploy"

# List of files to copy
$filesToCopy = @(
    "bslGlobals.js",
    "bslMetadata.js",
    "snippets.js",
    "bsl_language.js",
    "actions.js",
    "bslQuery.js",
    "bslDCS.js",
    "colors.js"
)

Write-Host "Starting BSL Console deployment..." -ForegroundColor Green

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path -Path $sourceDir -ChildPath $file
    $destPath = Join-Path -Path $destDir -ChildPath $file
    
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Host "Copied $file to deploy directory" -ForegroundColor Cyan
    } else {
        Write-Host "Warning: $file not found in source directory" -ForegroundColor Yellow
    }
}

Write-Host "Deployment completed successfully!" -ForegroundColor Green
