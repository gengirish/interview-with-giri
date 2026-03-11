/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" for Docker; remove/comment for Vercel deployment
  ...(process.env.DOCKER_BUILD === "1" && { output: "standalone" }),
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
