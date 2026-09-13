param (
    [string]$DeployUser = "dev",
    [string]$AppDir = "/opt/assethub"
)

Write-Host "============================================="
Write-Host " Desplegando AssetHub en sonnora-dev (10.0.0.6)"
Write-Host "============================================="

Write-Host "[1/4] Empaquetando código fuente localmente..."
tar -czf deploy.tar.gz --exclude="node_modules" --exclude="dist" --exclude=".next" --exclude=".vite" --exclude="bin" --exclude="obj" src docker-compose.yml

Write-Host "[2/4] Copiando deploy.tar.gz a sonnora-dev..."
scp deploy.tar.gz ${DeployUser}@10.0.0.6:/tmp/deploy.tar.gz

Write-Host "[3/4] Descomprimiendo y compilando en sonnora-dev..."
ssh ${DeployUser}@10.0.0.6 "sudo mkdir -p $AppDir && sudo chown ${DeployUser}:${DeployUser} $AppDir && cd $AppDir && tar -xzf /tmp/deploy.tar.gz && sudo docker-compose up -d --build"

Write-Host "[4/4] Limpiando archivos temporales..."
Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
ssh ${DeployUser}@10.0.0.6 "rm -f /tmp/deploy.tar.gz"

Write-Host "============================================="
Write-Host " ¡Despliegue de Código finalizado!"
Write-Host " Frontend: https://assetshub.dev.sonnora.mx"
Write-Host " API:      https://assetshub-api.dev.sonnora.mx"
Write-Host "============================================="
