# backup.ps1 — Daily SQLite backup for Guest Tracker
# Copies guests.db out of the Docker container into a dated file.
# Run automatically via Windows Task Scheduler (see README).

$BackupDir = "C:\GuestTracker\backups"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$DestFile  = "$BackupDir\guests_$Timestamp.db"
$KeepDays  = 30

# Ensure backup directory exists
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Copy DB out of the running container
docker cp guest-tracker:/app/guests.db $DestFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup saved → $DestFile"
} else {
    Write-Error "docker cp failed — is the guest-tracker container running?"
    exit 1
}

# Delete backups older than $KeepDays days
$pruned = Get-ChildItem "$BackupDir\guests_*.db" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) }

if ($pruned) {
    $pruned | Remove-Item -Force
    Write-Host "Pruned $($pruned.Count) backup(s) older than $KeepDays days"
} else {
    Write-Host "No old backups to prune"
}
