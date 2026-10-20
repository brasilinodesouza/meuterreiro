$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
    & npm.cmd install next@16.4.1 eslint-config-next@16.4.1 --save-exact --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as versões de segurança. Confira o acesso ao registro npm.' }

    & npm.cmd audit --omit=dev --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw 'A auditoria das dependências de produção precisa ser resolvida antes de publicar.' }

    foreach ($verification in @('lint', 'typecheck', 'test', 'build')) {
        & npm.cmd run $verification
        if ($LASTEXITCODE -ne 0) { throw "A verificação $verification falhou. A publicação não foi executada." }
    }
    Write-Host 'Atualização validada. Revise e publique package.json e package-lock.json.'
}
finally {
    Pop-Location
}
