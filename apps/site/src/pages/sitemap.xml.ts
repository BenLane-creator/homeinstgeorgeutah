import { normalizePathname } from "@home/config/seo";
import { site } from "@home/config/site";

function slugFromPath(path: string) {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.mdx$/, "") ?? ""
  );
}

function parseFrontmatter(raw: unknown) {
  const text = String(raw ?? "");

  if (!text.startsWith("---")) {
    return {};
  }

  const end = text.indexOf("\n---", 3);

  if (end === -1) {
    return {};
  }

  const frontmatterText = text.slice(3, end).trim();
  const data: Record<string, string> = {};

  for (const line of frontmatterText.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    value = value.replace(/^["']|["']$/g, "");
    data[key] = value;
  }

  return data;
}

function url(pathname: string) {
  return new URL(normalizePathname(pathname), site.url).toString();
}

export async function GET() {
  const staticRoutes = [
    "/",
    "/about/",
    "/homes/",
    "/buyers/",
    "/sellers/",
    "/relocation/",
    "/seller-financing/",
    "/horse-properties/",
    "/contact/",
    "/blog/",
    "/homes/search/",
    "/neighborhoods/",
  ];

  const neighborhoods = import.meta.glob("../content/neighborhoods/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default",
  });

  const blogPosts = import.meta.glob("../content/blog/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default",
  });

  const neighborhoodRoutes = Object.entries(neighborhoods).map(
    ([path, raw]) => {
      const frontmatter = parseFrontmatter(raw);
      const slug = frontmatter.slug || slugFromPath(path);
      return `/neighborhoods/${slug}/`;
    },
  );

  const blogRoutes = Object.entries(blogPosts).map(([path, raw]) => {
    const frontmatter = parseFrontmatter(raw);
    const slug = frontmatter.slug || slugFromPath(path);
    return `/blog/${slug}/`;
  });

  const routes = [
    ...new Set([...staticRoutes, ...neighborhoodRoutes, ...blogRoutes]),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${url(route)}</loc>
    <changefreq>${route.includes("/blog/") ? "monthly" : "weekly"}</changefreq>
    <priority>${route === "/" ? "1.0" : route.includes("/neighborhoods/") ? "0.8" : "0.7"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
