import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-5xl font-bold">Omnilog</h1>
      <p className="text-white/60">Films, séries, animés, mangas et jeux, au même endroit.</p>
      <Link href="/recherche" className="rounded-xl bg-white px-6 py-3 font-medium text-black hover:bg-white/90">
        Rechercher une œuvre
      </Link>
    </main>
  );
}
