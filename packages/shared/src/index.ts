/** Response body of the Worker's `GET /health` endpoint. */
export interface HealthResponse {
  status: 'ok';
  service: 'litsnap-worker';
}
