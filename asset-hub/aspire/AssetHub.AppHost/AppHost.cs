var builder = DistributedApplication.CreateBuilder(args);

var sql = builder.AddSqlServer("sql")
    .WithImageTag("2022-latest")
    .WithDataVolume("assethub-sql-data");

var db = sql.AddDatabase("assethub");

var api = builder.AddProject<Projects.AssetHub_Api>("api")
    .WithReference(db)
    .WaitFor(db);

builder.AddNpmApp("web", "../../src/frontend/apps/web")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
