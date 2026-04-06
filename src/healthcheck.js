'use strict';
// Minimal healthcheck – called by Docker, exits 0 (healthy) or 1 (unhealthy).
// Uses only Node.js built-ins so it works in the distroless runtime image.
const http = require('http');
http.get('http://localhost:3000/api/version', (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
}).on('error', () => process.exit(1));
