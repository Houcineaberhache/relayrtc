import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source: '/org/:orgId/project/:projectId/envoirments',
        destination: '/org/:orgId/project/:projectId/environments',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
