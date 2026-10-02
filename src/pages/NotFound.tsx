import PageShell from "../components/PageShell";
import { useSeo } from "../lib/seo";

// Shown for any address that is not a page. The server sends it as dist/404.html
// with a real 404 status; the client router shows it too, so the two agree.
export default function NotFound() {
  useSeo({
    title: "Page not found | BarkFind",
    description: "This page is not on barkfind.com.",
    path: typeof window !== "undefined" ? window.location.pathname : "/404",
    noindex: true,
  });
  const link = "font-semibold text-[#B74217] hover:underline";
  return (
    <PageShell title="Page not found" subtitle="The page you were looking for is not here. The address may be mistyped, or the page may have moved.">
      <ul className="flex flex-col gap-3 text-[#444]">
        <li>
          <a href="/" className={link}>Go to the BarkFind homepage</a>
        </li>
        <li>
          <a href="/discover" className={link}>Browse dog-friendly town guides, news and events</a>
        </li>
        <li>
          <a href="/support" className={link}>Help and support</a>
        </li>
      </ul>
    </PageShell>
  );
}
