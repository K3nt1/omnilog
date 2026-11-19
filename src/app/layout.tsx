import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSetup } from "@/components/AppSetup";
import { Nav } from "@/components/Nav";
import { APP_VERSION } from "@/lib/version";
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

const INSTALL_PROMPT_SCRIPT =
	"window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__omnilogInstall=e;window.dispatchEvent(new Event('omnilog:installable'));});";

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
				{/*
				  Manifeste de l'app installable (public/manifest.webmanifest). Le navigateur le télécharge sans cookies par défaut :
				  derrière Cloudflare Access, il tombait sur la page de connexion. « use-credentials » envoie le cookie d'Access.
				*/}
				<link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
				{/* Chrome peut proposer l'installation avant que React ne démarre : on garde l'invitation dès le début. */}
				<script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-neutral-950 pb-[calc(4rem+env(safe-area-inset-bottom))] text-white antialiased md:pb-0`}>
				<AppSetup />
				<Nav version={APP_VERSION} />
				{children}
				<footer className="px-4 pb-6 pt-10 text-center text-xs text-white/30">Omnilog v{APP_VERSION}</footer>
			</body>
		</html>
	);
}