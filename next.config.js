// next.config.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateEnvironment } = require('./config/environment-safety')

validateEnvironment(process.env)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright's local server uses this loopback host. Next 16 blocks
  // cross-origin development assets unless the host is explicitly trusted.
  allowedDevOrigins: ['127.0.0.1'],
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  // Runtime configuration comes from the deployment environment. Never copy
  // developer or staging environment files into server-function bundles.
  outputFileTracingIncludes: {
    '/api/*': ['./node_modules/pdfjs-dist/legacy/build/**', './node_modules/pdfjs-dist/standard_fonts/**', './node_modules/@napi-rs/canvas*/**'],
  },
  outputFileTracingExcludes: {
    '/*': ['./.env', './.env.*', './.env*'],
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ],
    }]
  },
}

module.exports = nextConfig
