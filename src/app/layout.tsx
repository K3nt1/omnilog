import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSetup } from "@/components/AppSetup";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "Omnilog",
		template: "%s · Omnilog",
	},
	description: "Films, séries, animes, mangas et jeux vidéo : watchlists, progression et rappels au même endroit.",
	robots: { index: false, follow: false },
	// iPhone : l'app ajoutée à l'écran d'accueil s'ouvre en plein écran (nécessaire pour les notifications).
	appleWebApp: { capable: true, title: "Omnilog", statusBarStyle: "black" },
	icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
	themeColor: "#0a0a0a",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="fr">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-neutral-950 text-white antialiased`}>
				<AppSetup />
				<Nav />
				{children}
			</body>
		</html>
	);
}