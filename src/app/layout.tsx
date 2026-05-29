import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Capa Cero PDF - Editor de PDF 100% Local y Privado",
  description: "Edita tus archivos PDF directamente en tu navegador de forma 100% segura. Sin servidores, sin bases de datos, con privacidad absoluta (Zero-Knowledge).",
  authors: [{ name: "Capa Cero" }],
  keywords: ["PDF Editor", "Privacidad", "Local PDF", "Zero Knowledge", "Firma PDF"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${outfit.className} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased`}>
        {children}
      </body>
    </html>
  );
}
