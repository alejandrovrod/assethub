using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AssetHub.Infrastructure.Persistence.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddInventoryTransactionWorkTaskId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "WorkTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions",
                column: "WorkTaskId");

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_WorkTasks_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions",
                column: "WorkTaskId",
                principalSchema: "tenant",
                principalTable: "WorkTasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_WorkTasks_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "WorkTaskId",
                schema: "tenant",
                table: "InventoryTransactions");
        }
    }
}
