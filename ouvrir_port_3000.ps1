# Script à exécuter en tant qu'Administrateur
# Double-cliquez sur ce fichier → "Exécuter avec PowerShell"

Write-Host "🔓 Ouverture du port 3000 pour UJAD..." -ForegroundColor Cyan

# Supprimer l'ancienne règle si elle existe
netsh advfirewall firewall delete rule name="UJAD App Port 3000" 2>$null

# Ajouter la nouvelle règle
netsh advfirewall firewall add rule name="UJAD App Port 3000" dir=in action=allow protocol=TCP localport=3000

if ($?) {
    Write-Host "✅ Port 3000 ouvert avec succès !" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Votre application est maintenant accessible depuis tous les appareils du réseau." -ForegroundColor Yellow
    Write-Host "   Lien réseau : http://192.168.88.91:3000" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host "❌ Erreur - Relancez ce script en tant qu'Administrateur" -ForegroundColor Red
}

Read-Host "Appuyez sur Entrée pour fermer"
