# tmp-dom.ps1 - предки securityPanel в живом DOM (ASCII-only).
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$tmp = [IO.Path]::GetTempPath()
$url = 'http://127.0.0.1:8080/account.html'
$out = Join-Path $tmp 'dom-out.html'
$err = Join-Path $tmp 'dom-err.txt'
$prof = Join-Path $tmp ('dom-prof-' + [Guid]::NewGuid().ToString('N'))
$flags = @('--headless', '--disable-gpu', '--dump-dom', '--virtual-time-budget=6000', $url)
$p = Start-Process -FilePath $edge -ArgumentList ($flags + @('--user-data-dir=' + $prof)) -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow
$t = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
Write-Host ('dom-len=' + $t.Length)
$i = $t.IndexOf('id="securityPanel"')
Write-Host ('sec-at=' + $i)
if ($i -ge 0) { Write-Host $t.Substring([Math]::Max(0, $i - 500), 560) }
Remove-Item $out -ErrorAction SilentlyContinue
Remove-Item $err -ErrorAction SilentlyContinue
