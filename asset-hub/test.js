process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDcxNjEzOC1kOTY4LTQ0NjAtNGI3YS0wOGRlZjFiNThlODgiLCJqdGkiOiIwNDU2M2JkZi05YWE2LTQyMGYtOTQ3Yi01MjQyOGM5YTRmZWUiLCJ0aWQiOiI4NWRiOWYwMC01ODIxLTQxODEtYjY2Ni0xMDlkYzQ4YTBlMWYiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJUZW5hbnQgQWRtaW4iLCJleHAiOjE3ODU4MjgwNTMsImlzcyI6IkFzc2V0SHViIiwiYXVkIjoiQXNzZXRIdWIifQ.PyvAY1JiA6qBj6FUfba_21fgoN7OCgMeOy8G01ENMrg';
fetch('https://localhost:7184/api/v1/asset-templates', {
  method: 'POST',
  headers: {
    'authorization': 'Bearer ' + token,
    'content-type': 'application/json',
    'x-tenant': 'demo'
  },
  body: JSON.stringify({
    "code": "002",
    "name": "Test",
    "description": "Test",
    "businessEntityTypeId": "00000000-0000-0000-0000-000000000000",
    "schemaJson": "{}",
    "lifecycleStates": {}
  })
}).then(async r => {
  console.log('Status:', r.status);
  console.log('Text:', await r.text());
}).catch(e => console.error(e));
