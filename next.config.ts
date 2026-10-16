import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

nextConfig.serverExternalPackages = ["@prisma/client", "@prisma/engines"];

export default nextConfig;
