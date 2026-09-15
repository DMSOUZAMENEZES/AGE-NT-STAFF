/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // uploads de áudio de consulta podem ser grandes
    },
  },
};

export default nextConfig;
