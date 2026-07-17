$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))) {
    npm ci
}

npm run build
Start-Process "http://127.0.0.1:3815"
npm start
