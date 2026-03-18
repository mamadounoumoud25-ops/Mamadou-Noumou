Write-Host "--- Tentative d'envoi du code vers GitHub (U.J.AD) ---" -ForegroundColor Cyan
& "C:\Program Files\Git\cmd\git.exe" push -u origin main
if ($?) {
    Write-Host "`n✅ Succès ! Votre code est sur GitHub." -ForegroundColor Green
    Write-Host "Vous pouvez maintenant retourner sur Render et actualiser la page." -ForegroundColor Green
}
else {
    Write-Host "`n❌ L'envoi a échoué." -ForegroundColor Red
    Write-Host "Vérifiez si une fenêtre de connexion GitHub est apparue en bas de votre écran." -ForegroundColor Yellow
}
Write-Host "`nAppuyez sur une touche pour fermer cette fenêtre..."
$x = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
