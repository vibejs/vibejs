Add a health check per service to the API: `GET /api/health/:service`. For the services `api` and `db` it answers 200 with `{ service, status: 'ok' }`. Any other service is a 404 error with the code `UNKNOWN_SERVICE`, and UI code that calls this endpoint should see that error code in its types.

Keep the project's checks passing.
