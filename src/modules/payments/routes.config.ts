export const routeConfig = {
  protected: true, // Default: payment routes require authentication
  public: [
    // Public payment page routes (no auth required)
    '/pay/:slug',
    '/pay/:slug/status',
    // CAPTCHA-protected payment APIs (no auth required)
    '/api/payment-links',
    '/api/payment-links/:ulid',
  ],
  roles: {
    // Organization payment settings (admin only)
    '/api/organizations/payment-link-settings': ['admin'],
  },
};
