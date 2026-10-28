# Instalador do Jarvis 1.1.0-rc.4 para Windows PowerShell 5.1+.
# Instalar: powershell.exe -ExecutionPolicy Bypass -File .\tools\Install-JarvisRc4.ps1
# Restaurar: powershell.exe -ExecutionPolicy Bypass -File .\tools\Install-JarvisRc4.ps1 -Restore
# Opcional: -DataPath "C:\caminho\FoundryVTT"; -ListBackups; -CheckOnly.
[CmdletBinding()]
param(
    [string]$DataPath,
    [switch]$Restore,
    [string]$BackupPath,
    [switch]$ListBackups,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$moduleId = 'fora-do-abismo-foundry'
$targetVersion = '1.1.0-rc.4'
$downloadUrl = 'https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/download/v1.1.0-rc.4/fora-do-abismo-foundry.zip'
$expectedZipSha256 = 'bcc095dfe705186c37f2124d7c7c332b8e079231554b8abaad080e4f044e6e6a'
$expectedManifestSha256 = '91d56e5c30e492e2d0eaf814efdc9595df1e541631c73e9cd7356b736b6f6abf'

function Say([string]$Message) { Write-Host "[Jarvis] $Message" }
function Fail([string]$Message) { throw $Message }

function FullPath([string]$Path) {
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-Within([string]$Parent, [string]$Child) {
    $prefix = (FullPath $Parent).TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
    $full = FullPath $Child
    if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Fail "Caminho fora da pasta permitida: $full"
    }
}

function Assert-PlainDirectory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { Fail "Pasta não encontrada: $Path" }
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Fail "Pasta com atalho/junção recusada por segurança: $Path"
    }
}

function Get-DataRoot {
    if ($DataPath) {
        $selected = $DataPath
        $origin = 'parâmetro -DataPath'
    } elseif ($env:FOUNDRY_VTT_DATA_PATH) {
        $selected = $env:FOUNDRY_VTT_DATA_PATH
        $origin = 'FOUNDRY_VTT_DATA_PATH'
    } else {
        if (-not $env:LOCALAPPDATA) { Fail 'LOCALAPPDATA não está definido.' }
        $default = Join-Path $env:LOCALAPPDATA 'FoundryVTT'
        $options = Join-Path $default 'Config\options.json'
        if (Test-Path -LiteralPath $options -PathType Leaf) {
            try { $configured = (Get-Content -LiteralPath $options -Raw -Encoding UTF8 | ConvertFrom-Json).dataPath }
            catch { Fail "Não foi possível ler $options : $($_.Exception.Message)" }
        }
        if ($configured) {
            $selected = $configured
            $origin = 'Config\options.json'
        } else {
            $selected = $default
            $origin = 'padrão do Foundry'
        }
    }
    $selected = [Environment]::ExpandEnvironmentVariables($selected)
    if ((Split-Path -Leaf $selected.TrimEnd('\', '/')) -ieq 'Data') {
        $selected = Split-Path -Parent $selected
    }
    if (-not (Test-Path -LiteralPath $selected -PathType Container)) { Fail "Pasta de dados não encontrada ($origin): $selected" }
    $root = (Resolve-Path -LiteralPath $selected).ProviderPath
    Assert-PlainDirectory $root
    Assert-PlainDirectory (Join-Path $root 'Data')
    Assert-PlainDirectory (Join-Path $root 'Data\modules')
    Say "Pasta de dados: $root ($origin)"
    return $root
}

function Assert-FoundryClosed {
    try { $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop) }
    catch { Fail "Não foi possível verificar se o Foundry está fechado: $($_.Exception.Message)" }
    $foundry = @($processes | Where-Object {
        $name = [string]$_.Name
        $cmd = [string]$_.CommandLine
        $exe = [string]$_.ExecutablePath
        ($name -in @('Foundry Virtual Tabletop.exe', 'FoundryVTT.exe', 'Foundry.exe')) -or
        (($name -ieq 'electron.exe') -and (($exe -match '(?i)foundryvtt|foundry virtual tabletop') -or
                                             ($cmd -match '(?i)foundryvtt|foundry virtual tabletop'))) -or
        (($name -in @('node.exe', 'node')) -and
         ($cmd -match '(?i)(foundryvtt|foundry virtual tabletop).*(main\.mjs|resources[\\/]app)' -or
          $cmd -match '(?i)resources[\\/]app[\\/]main\.mjs'))
    })
    if ($foundry.Count -gt 0) {
        $details = ($foundry | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', '
        Fail "Feche o Foundry antes de continuar. Processo encontrado: $details"
    }
}

function Read-Module([string]$Folder, [string]$ExpectedVersion) {
    Assert-PlainDirectory $Folder
    $manifestPath = Join-Path $Folder 'module.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { Fail "module.json ausente em $Folder" }
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Fail "module.json inválido em $Folder : $($_.Exception.Message)" }
    if ($manifest.id -cne $moduleId) { Fail "ID do módulo inesperado em $Folder : $($manifest.id)" }
    if (-not $manifest.version) { Fail "Versão ausente em $manifestPath" }
    if ($ExpectedVersion -and $manifest.version -cne $ExpectedVersion) {
        Fail "Versão inesperada em $manifestPath : $($manifest.version); esperado $ExpectedVersion"
    }
    return $manifest
}

function Get-FileMap([string]$Folder) {
    Assert-PlainDirectory $Folder
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Folder)
    $records = New-Object 'System.Collections.Generic.List[object]'
    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        foreach ($entry in Get-ChildItem -LiteralPath $dir -Force) {
            if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                Fail "Atalho/junção dentro do módulo recusado: $($entry.FullName)"
            }
            Assert-Within $Folder $entry.FullName
            if ($entry.PSIsContainer) { $stack.Push($entry.FullName) }
            else {
                $relative = $entry.FullName.Substring((FullPath $Folder).TrimEnd('\', '/').Length + 1)
                $records.Add([pscustomobject]@{
                    path = $relative.Replace('\', '/')
                    bytes = $entry.Length
                    sha256 = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                })
            }
        }
    }
    if ($records.Count -eq 0) { Fail "Pasta do módulo vazia: $Folder" }
    return (($records | Sort-Object path | ConvertTo-Json -Compress -Depth 4))
}

function Assert-Candidate([string]$Folder) {
    $manifest = Read-Module $Folder $targetVersion
    $manifestHash = (Get-FileHash -LiteralPath (Join-Path $Folder 'module.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($manifestHash -cne $expectedManifestSha256) { Fail 'module.json não corresponde ao asset publicado da rc.4.' }
    foreach ($relative in @($manifest.esmodules) + @($manifest.styles)) {
        if (-not $relative -or $relative -match '(^[\\/]|(^|[\\/])\.\.([\\/]|$)|:)' ) {
            Fail "Arquivo inválido em module.json: $relative"
        }
        $file = Join-Path $Folder $relative
        Assert-Within $Folder $file
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Fail "Arquivo declarado no module.json está ausente: $relative" }
    }
    [void](Get-FileMap $Folder)
}

function Assert-Zip([string]$ZipPath, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        if ($archive.Entries.Count -gt 5000) { Fail 'ZIP contém entradas demais.' }
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        [long]$total = 0
        foreach ($entry in $archive.Entries) {
            $name = [string]$entry.FullName
            if (-not $name -or $name -match '\\|:|^/|//|(^|/)\.\.?(?:/|$)') { Fail "Caminho inseguro no ZIP: $name" }
            $key = $name.TrimEnd('/')
            if (-not $seen.Add($key)) { Fail "Entrada repetida no ZIP: $name" }
            $target = Join-Path $Destination ($key.Replace('/', '\'))
            Assert-Within $Destination $target
            $unixType = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($unixType -eq 0xA000) { Fail "Atalho simbólico recusado no ZIP: $name" }
            if ($entry.Length -gt 50000000) { Fail "Arquivo grande demais no ZIP: $name" }
            $total += $entry.Length
            if ($total -gt 200000000) { Fail 'ZIP descompactado grande demais.' }
        }
        if (-not $seen.Contains('module.json')) { Fail 'ZIP não contém module.json na raiz.' }
    } finally { $archive.Dispose() }
}

function Make-Operation([string]$BackupRoot, [string]$Kind) {
    $name = '{0}-{1}-{2}' -f $Kind, (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $path = Join-Path $BackupRoot $name
    Assert-Within $BackupRoot $path
    [void][System.IO.Directory]::CreateDirectory($path)
    return $path
}

function Copy-And-Verify([string]$Source, [string]$Destination) {
    $sourceMap = Get-FileMap $Source
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
    if ((Get-FileMap $Destination) -cne $sourceMap) { Fail "Cópia não confere com a origem: $Destination" }
}

function Swap-Module([string]$ModuleFolder, [string]$NewSource, [string]$Operation, [string]$ExpectedVersion) {
    $displaced = Join-Path $Operation 'displaced'
    $failed = Join-Path $Operation 'failed-candidate'
    $newMap = Get-FileMap $NewSource
    $hadOld = Test-Path -LiteralPath $ModuleFolder -PathType Container
    Assert-FoundryClosed
    try {
        if ($hadOld) {
            Move-Item -LiteralPath $ModuleFolder -Destination $displaced
        }
        Copy-Item -LiteralPath $NewSource -Destination $ModuleFolder -Recurse -Force
        [void](Read-Module $ModuleFolder $ExpectedVersion)
        if ((Get-FileMap $ModuleFolder) -cne $newMap) { Fail 'Arquivos instalados não conferem com o pacote validado.' }
    } catch {
        $originalError = $_.Exception.Message
        $rollbackError = $null
        try {
            if ($hadOld) {
                $previous = Join-Path $Operation 'previous'
                if (-not (Test-Path -LiteralPath $previous -PathType Container)) { Fail 'Backup anterior indisponível.' }
                $previousMap = Get-FileMap $previous
                $currentMap = $null
                if (Test-Path -LiteralPath $ModuleFolder -PathType Container) {
                    try { $currentMap = Get-FileMap $ModuleFolder } catch { $currentMap = $null }
                }
                if ($currentMap -cne $previousMap) {
                    if (Test-Path -LiteralPath $ModuleFolder) { Move-Item -LiteralPath $ModuleFolder -Destination $failed }
                    Copy-And-Verify $previous $ModuleFolder
                }
                [void](Read-Module $ModuleFolder '')
                if ((Get-FileMap $ModuleFolder) -cne $previousMap) { Fail 'Restauração automática não conferiu com o backup.' }
            } elseif (Test-Path -LiteralPath $ModuleFolder) {
                Move-Item -LiteralPath $ModuleFolder -Destination $failed
            }
        } catch { $rollbackError = $_.Exception.Message }
        if ($rollbackError) {
            Fail "Falha na instalação: $originalError. Restauração automática falhou: $rollbackError. Backups preservados em $Operation"
        }
        Fail "Falha na instalação: $originalError. Versão anterior restaurada; backups preservados em $Operation"
    }
}

try {
    if ($Restore -and $CheckOnly) { Fail 'Use -Restore ou -CheckOnly, não ambos.' }
    if ($Restore -and $ListBackups) { Fail 'Use -Restore ou -ListBackups, não ambos.' }
    if ($BackupPath -and -not $Restore) { Fail '-BackupPath exige -Restore.' }
    $dataRoot = Get-DataRoot
    $modulesRoot = Join-Path $dataRoot 'Data\modules'
    $moduleFolder = Join-Path $modulesRoot $moduleId
    Assert-Within $modulesRoot $moduleFolder
    $backupRoot = Join-Path $dataRoot 'Backups\JarvisInstaller'
    Assert-Within $dataRoot $backupRoot
    Assert-FoundryClosed
    Say 'Foundry fechado: confirmado.'

    $currentVersion = '(não instalado)'
    if (Test-Path -LiteralPath $moduleFolder) {
        $currentVersion = (Read-Module $moduleFolder '').version
        Say "Versão atual: $currentVersion"
    }
    if ($CheckOnly) { Say 'Verificação concluída. Nenhum arquivo foi alterado.'; exit 0 }

    if ($ListBackups) {
        if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { Say 'Nenhum backup do instalador encontrado.'; exit 0 }
        Assert-PlainDirectory (Join-Path $dataRoot 'Backups')
        Assert-PlainDirectory $backupRoot
        $found = 0
        foreach ($item in @(Get-ChildItem -LiteralPath $backupRoot -Directory | Sort-Object CreationTimeUtc -Descending)) {
            $previous = Join-Path $item.FullName 'previous'
            if (Test-Path -LiteralPath $previous -PathType Container) {
                try {
                    $version = (Read-Module $previous '').version
                    Say "Backup: $version — $($item.FullName)"
                    $found++
                } catch { Say "Backup ignorado (inválido): $($item.FullName)" }
            }
        }
        if ($found -eq 0) { Say 'Nenhum backup válido encontrado.' }
        exit 0
    }

    if ($Restore) {
        if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { Fail 'Nenhum backup do instalador encontrado.' }
        Assert-PlainDirectory (Join-Path $dataRoot 'Backups')
        Assert-PlainDirectory $backupRoot
        if ($BackupPath) {
            $selected = (Resolve-Path -LiteralPath $BackupPath).ProviderPath
            if ((Split-Path -Leaf $selected) -ieq 'previous') { $selected = Split-Path -Parent $selected }
            Assert-Within $backupRoot $selected
            Assert-PlainDirectory $selected
            $source = Join-Path $selected 'previous'
        } else {
            $source = $null
            foreach ($item in @(Get-ChildItem -LiteralPath $backupRoot -Directory | Sort-Object CreationTimeUtc -Descending)) {
                $candidate = Join-Path $item.FullName 'previous'
                if (Test-Path -LiteralPath $candidate -PathType Container) {
                    try { [void](Read-Module $candidate ''); $source = $candidate; break } catch { }
                }
            }
            if (-not $source) { Fail 'Nenhum backup válido encontrado. Use -ListBackups para conferir.' }
        }
        Assert-Within $backupRoot $source
        $restoreVersion = (Read-Module $source '').version
        Say "Restaurando backup da versão $restoreVersion"
        [void](Get-FileMap $source)
        [void][System.IO.Directory]::CreateDirectory($backupRoot)
        $operation = Make-Operation $backupRoot 'Restore'
        if (Test-Path -LiteralPath $moduleFolder -PathType Container) {
            $previous = Join-Path $operation 'previous'
            Copy-And-Verify $moduleFolder $previous
            Say "Backup da versão atual: $previous"
        }
        Swap-Module $moduleFolder $source $operation $restoreVersion
        Say "SUCESSO: versão $restoreVersion restaurada. Backups preservados em $backupRoot"
        exit 0
    }

    [void][System.IO.Directory]::CreateDirectory((Join-Path $dataRoot 'Backups'))
    Assert-PlainDirectory (Join-Path $dataRoot 'Backups')
    [void][System.IO.Directory]::CreateDirectory($backupRoot)
    Assert-PlainDirectory $backupRoot
    $operation = Make-Operation $backupRoot 'Install'
    $zipPath = Join-Path $operation 'fora-do-abismo-foundry.zip'
    $candidateFolder = Join-Path $operation 'candidate'
    Say 'Baixando a candidata 1.1.0-rc.4 publicada no GitHub...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -MaximumRedirection 10 -UseBasicParsing -Headers @{ 'User-Agent' = 'Jarvis-Windows-Installer/1.0' } -ErrorAction Stop
    $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($zipHash -cne $expectedZipSha256) { Fail "SHA-256 do ZIP não confere. Esperado $expectedZipSha256; recebido $zipHash. Nenhuma instalação foi alterada." }
    Say 'Integridade do download: confirmada (SHA-256).'
    [void][System.IO.Directory]::CreateDirectory($candidateFolder)
    Assert-Zip $zipPath $candidateFolder
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $candidateFolder)
    Assert-Candidate $candidateFolder
    Say 'Pacote e module.json: válidos.'

    if ($currentVersion -ceq $targetVersion -and
        (Get-FileMap $moduleFolder) -ceq (Get-FileMap $candidateFolder)) {
        Say "$targetVersion já está instalada e todos os arquivos conferem. Nenhuma alteração necessária."
        exit 0
    }

    if (Test-Path -LiteralPath $moduleFolder -PathType Container) {
        $previous = Join-Path $operation 'previous'
        Copy-And-Verify $moduleFolder $previous
        [void](Read-Module $previous $currentVersion)
        Say "Backup completo da versão ${currentVersion}: $previous"
    }
    Swap-Module $moduleFolder $candidateFolder $operation $targetVersion
    Say "SUCESSO: Jarvis $targetVersion instalado em $moduleFolder"
    Say "Backups preservados em $backupRoot"
    Say "Para restaurar: powershell.exe -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Restore"
    exit 0
} catch {
    Write-Host "[Jarvis] ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
