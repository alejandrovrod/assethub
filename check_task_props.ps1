$connStr = "Server=db32354.public.databaseasp.net; Database=db32354; User Id=db32354; Password=9y-P!Bt8e6R@; Encrypt=True; TrustServerCertificate=True; MultipleActiveResultSets=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT Id, Title, PropertiesJson FROM tenant.WorkTasks WHERE Id = '24c3cb92-2165-4018-adf5-bbc1a94f106c'"
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Host ("ID: " + $r[0].ToString())
    Write-Host ("Title: " + $r[1].ToString())
    Write-Host ("Props: " + $r[2].ToString())
}
$r.Close()
$conn.Close()

