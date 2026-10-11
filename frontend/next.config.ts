import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/main.html", destination: "/", permanent: true },
      { source: "/menu.html", destination: "/menu", permanent: true },
      { source: "/shop.html", destination: "/shop", permanent: true },
      { source: "/combo.html", destination: "/combo", permanent: true },
      { source: "/about-us.html", destination: "/about-us", permanent: true },
      { source: "/login.html", destination: "/login", permanent: true },
      {
        source: "/registration.html",
        destination: "/registration",
        permanent: true,
      },
      { source: "/user.html", destination: "/account", permanent: true },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
