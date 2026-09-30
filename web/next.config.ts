import type { NextConfig } from "next";

// Tutte le pagine sono pre-renderizzate in fase di build dai dati in web/data/*.json:
// il sito è statico anche senza output "export" (che in Next 16 genera percorsi di
// precaricamento non corrispondenti a quelli richiesti dal browser).
const nextConfig: NextConfig = {};

export default nextConfig;
