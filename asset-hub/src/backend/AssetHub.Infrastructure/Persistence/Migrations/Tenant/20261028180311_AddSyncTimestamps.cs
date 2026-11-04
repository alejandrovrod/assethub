using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AssetHub.Infrastructure.Persistence.Migrations.Tenant
{
    /// <summary>
    /// Agrega las columnas que sostienen el delta sync (022 §8.2).
    ///
    /// Las columnas nuevas se crean <b>nullable</b>, se rellenan con una fecha que tiene
    /// sentido para cada entidad y recién después se pasan a <c>NOT NULL</c>.
    ///
    /// El EF las generaría directamente <c>NOT NULL</c> con
    /// <c>defaultValue: 0001-01-01</c>. Eso funciona en una base vacía y es un desastre en
    /// una con datos: todas las filas existentes quedarían con la fecha mínima, o sea
    /// "nunca modificadas". Como el delta filtra por <c>UpdatedAt &gt; cursor</c>, esas
    /// filas nunca llegarían a un dispositivo que ya sincronizó una vez — y peor, quedaría
    /// una <c>DEFAULT CONSTRAINT</c> pegada a la columna que después hay que cazar por
    /// nombre para poder quitarla.
    /// </summary>
    public partial class AddSyncTimestamps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Columnas nuevas, nullable.
            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                schema: "tenant",
                table: "WorkTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                schema: "tenant",
                table: "Incidents",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                schema: "tenant",
                table: "Incidents",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                schema: "tenant",
                table: "Incidents",
                type: "datetime2",
                nullable: true);

            // 2. Backfill. `UpdatedAt` arranca igual a la fecha de alta: la fila no cambió
            //    desde entonces, así que ése es su último cambio real. El CASE cubre filas
            //    viejas con CreatedAt en el default (importadores que no lo seteaban):
            //    dejarlas en 0001 las mandaría al fondo del primer pull y el cliente las
            //    vería con una fecha imposible.
            migrationBuilder.Sql(
                """
                UPDATE [tenant].[WorkTasks]
                SET [UpdatedAt] = CASE
                    WHEN [CreatedAt] > '1900-01-01' THEN [CreatedAt]
                    ELSE SYSUTCDATETIME()
                END;
                """);

            migrationBuilder.Sql(
                """
                UPDATE [tenant].[Incidents]
                SET [CreatedAt] = CASE
                        WHEN [ReportedAt] > '1900-01-01' THEN [ReportedAt]
                        ELSE SYSUTCDATETIME()
                    END,
                    [UpdatedAt] = CASE
                        WHEN [ReportedAt] > '1900-01-01' THEN [ReportedAt]
                        ELSE SYSUTCDATETIME()
                    END;
                """);

            // Filas preexistentes de Assets/StockBalances en el default: no son nuevas,
            // pero un `updatedAt` de 0001-01-01 en el stream confunde al cliente y rompe
            // cualquier cálculo de antigüedad. Se normalizan una sola vez.
            migrationBuilder.Sql(
                """
                UPDATE [tenant].[Assets]
                SET [UpdatedAt] = CASE
                    WHEN [CreatedAt] > '1900-01-01' THEN [CreatedAt]
                    ELSE SYSUTCDATETIME()
                END
                WHERE [UpdatedAt] <= '1900-01-01';
                """);

            migrationBuilder.Sql(
                """
                UPDATE [tenant].[StockBalances]
                SET [UpdatedAt] = SYSUTCDATETIME()
                WHERE [UpdatedAt] <= '1900-01-01';
                """);

            // 3. Recién ahora NOT NULL.
            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAt",
                schema: "tenant",
                table: "WorkTasks",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                schema: "tenant",
                table: "Incidents",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAt",
                schema: "tenant",
                table: "Incidents",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2",
                oldNullable: true);

            // 4. Índices del cursor. Se crean después del backfill para no mantenerlos
            //    durante las actualizaciones masivas.
            migrationBuilder.CreateIndex(
                name: "IX_WorkTasks_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "WorkTasks",
                columns: new[] { "TenantId", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "StockBalances",
                columns: new[] { "TenantId", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Incidents_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "Incidents",
                columns: new[] { "TenantId", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Assets_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "Assets",
                columns: new[] { "TenantId", "UpdatedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkTasks_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropIndex(
                name: "IX_StockBalances_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "StockBalances");

            migrationBuilder.DropIndex(
                name: "IX_Incidents_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "Incidents");

            migrationBuilder.DropIndex(
                name: "IX_Assets_TenantId_UpdatedAt_Id",
                schema: "tenant",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                schema: "tenant",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "tenant",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                schema: "tenant",
                table: "Incidents");
        }
    }
}
