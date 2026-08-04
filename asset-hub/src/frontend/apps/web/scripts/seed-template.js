

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  console.log("Haciendo login...");
  const loginRes = await fetch("https://localhost:7184/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.com", password: "Admin123!" })
  });

  if (!loginRes.ok) {
    console.error("Login falló:", await loginRes.text());
    return;
  }

  const { accessToken, tenantSlug } = await loginRes.json();
  console.log("Token obtenido. Tenant:", tenantSlug);

  const payload = {
    businessEntityTypeId: "00000000-0000-0000-0000-000000000000",
    code: "VEH-CORP",
    name: "Vehículo Corporativo",
    description: "Plantilla base para registrar todos los vehículos de la flota.",
    schemaJson: JSON.stringify({
      type: "object",
      properties: {
        marca: { type: "string", title: "Marca" },
        modelo: { type: "string", title: "Modelo" },
        anio: { type: "integer", title: "Año de Fabricación" },
        patente: { type: "string", title: "Patente / Matrícula" },
        kilometraje: { type: "number", title: "Kilometraje Actual" }
      },
      required: ["marca", "modelo", "patente"]
    }),
    allowedChildTemplateIds: [],
    lifecycleStates: {
      initialState: "Disponible",
      transitions: {
        "Disponible": ["En Uso", "En Mantenimiento", "Baja"],
        "En Uso": ["Disponible", "En Mantenimiento"],
        "En Mantenimiento": ["Disponible", "Baja"],
        "Baja": []
      }
    },
    maintenanceChecklist: ""
  };

  console.log("Guardando plantilla...");
  const createRes = await fetch("https://localhost:7184/api/v1/asset-templates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "X-Tenant": tenantSlug
    },
    body: JSON.stringify(payload)
  });

  if (!createRes.ok) {
    console.error("Error al crear la plantilla:", await createRes.text());
  } else {
    console.log("¡Plantilla creada exitosamente en la base de datos!");
  }
}

main().catch(console.error);
