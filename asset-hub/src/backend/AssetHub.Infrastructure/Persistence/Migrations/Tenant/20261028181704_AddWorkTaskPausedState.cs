using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AssetHub.Infrastructure.Persistence.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddWorkTaskPausedState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PausedAt",
                schema: "tenant",
                table: "WorkTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResumedAt",
                schema: "tenant",
                table: "WorkTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReworkReason",
                schema: "tenant",
                table: "WorkTasks",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReworkedAt",
                schema: "tenant",
                table: "WorkTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReworkedByUserId",
                schema: "tenant",
                table: "WorkTasks",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TotalPausedSeconds",
                schema: "tenant",
                table: "WorkTasks",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PausedAt",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "ResumedAt",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "ReworkReason",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "ReworkedAt",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "ReworkedByUserId",
                schema: "tenant",
                table: "WorkTasks");

            migrationBuilder.DropColumn(
                name: "TotalPausedSeconds",
                schema: "tenant",
                table: "WorkTasks");
        }
    }
}
