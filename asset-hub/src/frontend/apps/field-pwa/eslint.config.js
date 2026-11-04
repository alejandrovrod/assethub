export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message: "La UI no llama a la API. Usa comandos de @asset-hub/core-offline.",
            },
          ],
          patterns: ["**/transport/**", "@asset-hub/core-offline/dist/**"],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "No usar localStorage. Usa la base de datos Dexie de @asset-hub/core-offline.",
        },
        {
          name: "sessionStorage",
          message: "No usar sessionStorage. Usa la base de datos Dexie de @asset-hub/core-offline.",
        },
      ],
    },
  },
];

