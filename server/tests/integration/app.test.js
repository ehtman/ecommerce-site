/**
 * INTEGRATION tests for app-wide behaviour: health check, API docs, 404s,
 * security headers and CORS.
 */
import { api } from '../helpers/factories.js';

describe('App basics', () => {
  it('GET /api/health answers ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.environment).toBe('test');
  });

  it('unknown routes return 404 in the standard error shape', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Route not found: GET /api/does-not-exist',
    });
  });

  it('serves the OpenAPI spec with every route documented', async () => {
    const res = await api().get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/auth/admin/login',
        '/auth/google',
        '/auth/logout',
        '/auth/me',
        '/auth/verify-email',
        '/auth/resend-verification',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/users/password',
        '/users/profile',
        '/addresses',
        '/addresses/{id}',
        '/addresses/{id}/default',
        '/categories',
        '/categories/{slugOrId}',
        '/products',
        '/products/brands',
        '/products/{slugOrId}',
        '/products/{id}/images/{imageId}',
        '/products/{id}/stock',
        '/uploads/image',
        '/cart',
        '/cart/items',
        '/cart/items/{productId}',
        '/wishlist',
        '/wishlist/{productId}',
        '/coupons',
        '/coupons/{id}',
        '/coupons/validate',
        '/orders',
        '/orders/my',
        '/orders/{id}',
        '/orders/{id}/cancel',
        '/admin/orders',
        '/admin/orders/{id}/status',
        '/payments/checkout-session',
        '/payments/webhook',
        '/payments/expire-unpaid',
      ]),
    );
  });

  it('serves the Swagger UI page', async () => {
    const res = await api().get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger');
  });

  it('sends security headers (helmet)', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined(); // hides that we use Express
  });

  it('allows CORS only for the configured frontend', async () => {
    const allowed = await api().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await api().get('/api/health').set('Origin', 'http://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
