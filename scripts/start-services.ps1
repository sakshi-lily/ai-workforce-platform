# ==============================================================================
# AI Workforce Platform — Local Services Launcher (MySQL & Redis)
# ==============================================================================

Write-Host "Checking MySQL (port 3306)..." -ForegroundColor Cyan
$mysqlProc = Get-Process mysqld -ErrorAction SilentlyContinue
if (-not $mysqlProc) {
    Write-Host "Starting MySQL Server 8.4..." -ForegroundColor Yellow
    $mySqlExe = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
    $mySqlIni = "C:\ProgramData\MySQL\MySQL Server 8.4\my.ini"
    Start-Process -FilePath $mySqlExe -ArgumentList "--defaults-file=`"$mySqlIni`"", "--console" -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Host "MySQL is already running (PID: $($mysqlProc[0].Id))." -ForegroundColor Green
}

Write-Host "Checking Redis (port 6379)..." -ForegroundColor Cyan
$redisProc = Get-Process redis-server -ErrorAction SilentlyContinue
if (-not $redisProc) {
    Write-Host "Starting Redis Server..." -ForegroundColor Yellow
    $redisExe = "C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\taizod1024.redis-windows-fork_Microsoft.Winget.Source_8wekyb3d8bbwe\Redis-8.10.1-Windows-x64-msys2\redis-server.exe"
    Start-Process -FilePath $redisExe -ArgumentList "--daemonize no" -WindowStyle Hidden
    Start-Sleep -Seconds 1
} else {
    Write-Host "Redis is already running (PID: $($redisProc[0].Id))." -ForegroundColor Green
}

Write-Host "Verifying connectivity..." -ForegroundColor Cyan
$mysqlPort = (Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue).TcpTestSucceeded
$redisPort = (Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -WarningAction SilentlyContinue).TcpTestSucceeded

if ($mysqlPort -and $redisPort) {
    Write-Host "All background infrastructure services are healthy and listening!" -ForegroundColor Green
} else {
    Write-Warning "MySQL reachable: $mysqlPort | Redis reachable: $redisPort"
}
