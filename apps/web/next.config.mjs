/** @type {import('next').NextConfig} */
export default {
  // Build + SSR en el mismo contenedor ECS (doc 11 §1). `standalone` crea
  // symlinks, que en Windows exigen permisos que la sesión normal no tiene
  // (A-38): se activa solo al construir la imagen, que corre en Linux.
  ...(process.env.SALIDA_STANDALONE === '1' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
}
