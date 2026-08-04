
async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const payload = {"code":"Veh01","name":"Vehiculo ligero","description":"Vehiculo ligero","businessEntityTypeId":"00000000-0000-0000-0000-000000000000","schemaJson":"{\n  \"type\": \"object\",\n  \"properties\": {\n    \"field_1785792790022\": {\n      \"type\": \"number\",\n      \"title\": \"tamaño\"\n    },\n    \"field_1785792814157\": {\n      \"type\": \"number\",\n      \"title\": \"color\"\n    }\n  },\n  \"required\": [\n    \"field_1785792790022\",\n    \"field_1785792814157\"\n  ]\n}","lifecycleStates":{"initialState":"iniciando","transitions":{"iniciando":["terminando"],"terminando":[]},"nodes":[{"id":"iniciando","data":{"label":"iniciando"},"position":{"x":-6.5,"y":62},"width":150,"height":40,"selected":true,"positionAbsolute":{"x":-6.5,"y":62},"dragging":false},{"id":"terminando","data":{"label":"terminando"},"position":{"x":267.5,"y":93.5},"width":150,"height":40,"selected":false,"positionAbsolute":{"x":267.5,"y":93.5},"dragging":false}],"edges":[{"source":"iniciando","sourceHandle":null,"target":"terminando","targetHandle":null,"markerEnd":{"type":"arrowclosed"},"id":"reactflow__edge-iniciando-terminando"}]},"maintenanceChecklist":"","allowedChildTemplateIds":[]};

  const createRes = await fetch("https://localhost:7184/api/v1/asset-templates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3OWRmMDEzNy01NzFiLTRjZGItZTViNi0wOGRlZjFhNTI0NzkiLCJqdGkiOiIxOGQ5MDNmYi02NjU5LTRmYjYtYTFjNi05OTM2ZWY3YTMzZDgiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJhZG1pbiIsImV4cCI6MTc4NTc5MzY0NiwiaXNzIjoiQXNzZXRIdWIiLCJhdWQiOiJBc3NldEh1YiJ9.A5oymp03KyiWJ5ywhgPk7JloufqqFOdV094PpjzlskA",
      "X-Tenant": "demo"
    },
    body: JSON.stringify(payload)
  });

  const text = await createRes.text();
  console.log("Status:", createRes.status);
  console.log("Response:", text);
}

main().catch(console.error);
