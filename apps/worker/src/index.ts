import { Hono } from 'hono';
import type { HealthResponse } from '@litsnap/shared';

const app = new Hono();

app.get('/health', (c) => c.json<HealthResponse>({ status: 'ok', service: 'litsnap-worker' }));

export default app;
