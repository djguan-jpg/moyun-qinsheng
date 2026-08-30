param([switch]$Apply)
$ErrorActionPreference='Stop'
$config=Get-Content -Raw -LiteralPath "$PSScriptRoot\..\security\cloudflare-controls.json" | ConvertFrom-Json
if($config.mode -ne 'merge'){throw 'Only merge-mode controls are accepted.'}
if(-not $Apply){$config | ConvertTo-Json -Depth 10; exit 0}
if($env:GUYUN_CLOUDFLARE_APPLY -ne 'YES'){throw 'Apply blocked: set GUYUN_CLOUDFLARE_APPLY=YES in an authorized deployment phase.'}
throw 'External deployment gate: retrieve the existing complete ruleset, merge by ref, review the diff, then apply through the approved controller.'
