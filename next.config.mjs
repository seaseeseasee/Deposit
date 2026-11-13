const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
export default {
  poweredByHeader: false,
  serverExternalPackages: ['pdfkit', 'exceljs'],
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
};
