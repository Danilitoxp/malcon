/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: `https://malcon-whatsapp.velbav.easypanel.host/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
