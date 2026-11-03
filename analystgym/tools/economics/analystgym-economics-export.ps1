$ErrorActionPreference = 'Stop'
$economyWord = $null
$economyDoc = $null
$economyRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\docs'))
$economyQa = Join-Path $PSScriptRoot '.qa'
New-Item -ItemType Directory -Path $economyQa -Force | Out-Null
try {
    $economyWord = New-Object -ComObject Word.Application
    $economyWord.Visible = $false
    $economyWord.DisplayAlerts = 0
    $economyWord.AutomationSecurity = 3
    $economyDoc = $economyWord.Documents.Open((Join-Path $economyRoot 'analystgym-economics-b2c-2026-10-26.docx'), $false, $true)
    $economyDoc.ExportAsFixedFormat((Join-Path $economyQa 'native-word.pdf'), 17)
    Write-Output ('Exported pages: ' + $economyDoc.ComputeStatistics(2))
} finally {
    if ($null -ne $economyDoc) { $economyDoc.Close(0); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($economyDoc) }
    if ($null -ne $economyWord) { $economyWord.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($economyWord) }
}
