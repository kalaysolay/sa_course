<#
    Статический сервер макета AnalystGym без внешних зависимостей.

    Нужен машинам без Python и без Node.js: PowerShell есть в Windows из коробки.
    Поведение повторяет server.py и serve.mjs — раздаём файлы каталога макета
    по HTTP на loopback. MIME-типы заданы явно: на части машин реестр Windows
    отдаёт .js как text/plain, и браузер перестаёт выполнять скрипты.

    Использование:
        powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
        powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 --port 8080
#>
param(
    [int]$Port = 0,
    [string]$Root = ''
)

$ErrorActionPreference = 'Stop'

# Каталог раздачи: по умолчанию — каталог самого скрипта (tasks-mockup).
if ([string]::IsNullOrEmpty($Root)) {
    $Root = $PSScriptRoot
}
$Root = [System.IO.Path]::GetFullPath($Root)

# Порт: приоритет у --port, затем у -Port, затем у переменной окружения PORT.
$scriptArgs = $args
for ($i = 0; $i -lt $scriptArgs.Count; $i++) {
    if ($scriptArgs[$i] -eq '--port' -and ($i + 1) -lt $scriptArgs.Count) {
        $Port = [int]$scriptArgs[$i + 1]
    }
    elseif ($scriptArgs[$i] -like '--port=*') {
        $Port = [int]$scriptArgs[$i].Substring(7)
    }
}
if ($Port -le 0) {
    $parsedPort = 0
    if ($env:PORT -and [int]::TryParse($env:PORT, [ref]$parsedPort)) {
        $Port = $parsedPort
    }
    else {
        $Port = 5180
    }
}

$mime = @{
    '.html'  = 'text/html; charset=utf-8'
    '.htm'   = 'text/html; charset=utf-8'
    '.js'    = 'text/javascript; charset=utf-8'
    '.mjs'   = 'text/javascript; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.map'   = 'application/json; charset=utf-8'
    '.txt'   = 'text/plain; charset=utf-8'
    '.md'    = 'text/markdown; charset=utf-8'
    '.svg'   = 'image/svg+xml'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.jpeg'  = 'image/jpeg'
    '.gif'   = 'image/gif'
    '.webp'  = 'image/webp'
    '.ico'   = 'image/x-icon'
    '.woff'  = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'   = 'font/ttf'
}

function Send-Response {
    <#
        Формирует HTTP/1.1-ответ с телом и закрывает соединение.
        Content-Length обязателен: иначе браузер ждёт конца потока и «висит».
    #>
    param(
        [System.IO.Stream]$Stream,
        [int]$Code,
        [string]$ContentType,
        [byte[]]$Body
    )

    $reason = 'OK'
    if ($Code -eq 404) { $reason = 'Not Found' }
    elseif ($Code -eq 400) { $reason = 'Bad Request' }

    $header = "HTTP/1.1 $Code $reason`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $($Body.Length)`r`n" +
              "Cache-Control: no-store`r`n" +
              "Connection: close`r`n`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

function Resolve-Target {
    <#
        Превращает путь запроса в путь файла внутри каталога раздачи.
        Возвращает $null, если путь выходит за пределы каталога (обход каталогов).
    #>
    param([string]$Target)

    $pathOnly = ($Target -split '\?')[0]
    try {
        $pathOnly = [System.Uri]::UnescapeDataString($pathOnly)
    }
    catch {
        return $null
    }
    if ($pathOnly.EndsWith('/')) {
        $pathOnly += 'index.html'
    }

    $relative = $pathOnly.TrimStart([char[]]@('/', '\'))
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
    if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $full
}

function Handle-Client {
    <#
        Читает один HTTP-запрос и отдаёт файл. Ошибки клиента не поднимаем:
        соединение закрывается, сервер продолжает слушать.
    #>
    param([System.Net.Sockets.TcpClient]$Client)

    $stream = $Client.GetStream()
    $buffer = New-Object byte[] 8192
    $raw = New-Object System.Collections.Generic.List[byte]
    $text = ''

    # Ждём конец заголовков (\r\n\r\n) либо разрыв соединения.
    while ($text.IndexOf("`r`n`r`n") -lt 0) {
        $read = $stream.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { return }
        for ($i = 0; $i -lt $read; $i++) { $raw.Add($buffer[$i]) }
        $text = [System.Text.Encoding]::ASCII.GetString($raw.ToArray())
        if ($raw.Count -gt 65536) { return }
    }

    $requestLine = ($text -split "`r`n")[0]
    $parts = $requestLine -split ' '
    if ($parts.Count -lt 2) { return }
    if ($parts[0] -ne 'GET' -and $parts[0] -ne 'HEAD') {
        Send-Response -Stream $stream -Code 400 -ContentType 'text/plain; charset=utf-8' `
                      -Body ([System.Text.Encoding]::UTF8.GetBytes('Bad Request'))
        return
    }

    $full = Resolve-Target $parts[1]
    if ($null -eq $full -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Response -Stream $stream -Code 404 -ContentType 'text/plain; charset=utf-8' `
                      -Body ([System.Text.Encoding]::UTF8.GetBytes('Not found'))
        return
    }

    $body = [System.IO.File]::ReadAllBytes($full)
    $extension = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
    $contentType = $mime[$extension]
    if (-not $contentType) { $contentType = 'application/octet-stream' }

    if ($parts[0] -eq 'HEAD') {
        $header = "HTTP/1.1 200 OK`r`n" +
                  "Content-Type: $contentType`r`n" +
                  "Content-Length: $($body.Length)`r`n" +
                  "Cache-Control: no-store`r`n" +
                  "Connection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Flush()
        return
    }

    Send-Response -Stream $stream -Code 200 -ContentType $contentType -Body $body
}

# Слушаем только loopback: макет не должен быть доступен из сети.
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
}
catch [System.Net.Sockets.SocketException] {
    # Порт занят: скорее всего, макет уже запущен другим экземпляром.
    Write-Host "Port $Port is already in use."
    Write-Host "The mockup is probably already running: http://127.0.0.1:$Port"
    Write-Host "Close the previous server or start another copy with --port 8080."
    exit 2
}

Write-Host "AnalystGym mockup: http://127.0.0.1:$Port"
Write-Host "Folder: $Root"
Write-Host "Press Ctrl+C to stop."

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.NoDelay = $true
            Handle-Client $client
        }
        catch {
            Write-Host "Request failed: $($_.Exception.Message)"
        }
        finally {
            $client.Close()
        }
    }
}
finally {
    $listener.Stop()
}
