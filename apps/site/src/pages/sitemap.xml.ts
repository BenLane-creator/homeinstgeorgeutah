import { getCollection, type CollectionEntry } from "astro:content";
import { normalizePathname } from "@home/config/seo";
import { site } from "@home/config/site";

function entrySlug(
  entry: CollectionEntry<"neighborhoods"> | CollectionEntry<"blog">,
) {
  return entry.data.slug || entry.id.replace(/\.(md|mdx)$/i, "");
}

function url(pathname: string) {
  return new URL(normalizePathname(pathname), site.url).toString();
}

export async function GET() {
  const [neighborhoods, blogPosts] = await Promise.all([
    getCollection("neighborhoods"),
    getCollection("blog", ({ data }) => !data.draft),
  ]);

  const staticRoutes = [
    "/",
    "/about/",
    "/buyers/",
    "/sellers/",
    "/relocation/",
    "/seller-financing/",
    "/horse-properties/",
    "/contact/",
    "/blog/",
    "/homes/search/",
    "/neighborhoods/",
    "/privacy/",
    "/terms/",
    "/accessibility/",
  ];

  const routes = [
    ...new Set([
      ...staticRoutes,
      ...neighborhoods.map((entry) => `/neighborhoods/${entrySlug(entry)}/`),
      ...blogPosts.map((entry) => `/blog/${entrySlug(entry)}/`),
    ]),
  ].sort();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${url(route)}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
