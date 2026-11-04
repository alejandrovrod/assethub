using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AssetHub.Infrastructure.Persistence.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddRowVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Sin defaultValue a propósito: SQL Server no admite DEFAULT en una columna
            // rowversion. La columna se genera sola y el motor rellena las filas existentes.
            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                schema: "tenant",
                table: "WorkTasks",
                type: "rowversion",
                rowVersion: true,
                nullable: false);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                schema: "tenant",
                table: "Incidents",
                type: "rowversion",
                rowVersion: true,
                nullable: false);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                schema: "tenant",
                table: "Assets",
                type: "rowversion",
                rowVersion: true,
                nullable: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RowVersion",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                schema: "tenant",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                schema: "tenant",
                table: "Assets");
        }
    }
}
