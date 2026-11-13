# Empaqueta la extension para repartir: solo lo versionado, sin dist/ ni src/env.js.
#
# No usa Compress-Archive: en PowerShell 5 escribe los nombres con barra
# invertida ("src\dashboard.js"), que el formato ZIP no admite. En Windows pasa
# desapercibido, pero al descomprimir en macOS o Linux salen archivos llamados
# "src\dashboard.js" sueltos y la extension no carga.

Add-Type -AssemblyName System.IO.Compression.FileSystem

$raiz = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $raiz 'manifest.json') -Raw | ConvertFrom-Json).version
$salida = Join-Path $raiz 'dist'
$destino = Join-Path $salida "agility-task-lite-$version.zip"

New-Item -ItemType Directory -Force -Path $salida | Out-Null
Remove-Item -Path (Join-Path $salida '*.zip') -Force -ErrorAction SilentlyContinue

$archivos = & git -C $raiz ls-files
if ($LASTEXITCODE -ne 0 -or -not $archivos) {
  throw "No se pudo listar los archivos versionados en $raiz"
}

$zip = [System.IO.Compression.ZipFile]::Open($destino, 'Create')
try {
  foreach ($rel in $archivos) {
    $origen = Join-Path $raiz ($rel -replace '/', '\')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $origen, $rel) | Out-Null
  }
} finally {
  $zip.Dispose()
}

# Un zip escrito no prueba que quedo bien: se vuelve a abrir y se comprueba.
$zip = [System.IO.Compression.ZipFile]::OpenRead($destino)
try {
  $torcidas = $zip.Entries | Where-Object { $_.FullName -match '\\' }
  if ($torcidas) { throw "Hay entradas con barra invertida: $($torcidas[0].FullName)" }
  if ($zip.Entries.Count -ne $archivos.Count) {
    throw "El zip trae $($zip.Entries.Count) entradas y se esperaban $($archivos.Count)"
  }
  if (-not ($zip.Entries | Where-Object { $_.FullName -eq 'manifest.json' })) {
    throw 'Falta manifest.json en el zip'
  }
} finally {
  $zip.Dispose()
}

Write-Host "$destino — $($archivos.Count) archivos, $([math]::Round((Get-Item $destino).Length / 1KB)) KB"
