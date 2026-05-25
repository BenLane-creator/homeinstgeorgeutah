import { site } from "./site";

export function normalizePathname(pathname = "/") {
	if (!pathname || pathname === "/") return "/";

	const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return clean.endsWith("/") ? clean : `${clean}/`;
}

export function title(pageTitle?: string) {
	return pageTitle
		? `${pageTitle} | ${site.name}`
		: `${site.name} | ${site.market} Real Estate`;
}

export function canonical(pathname = "/") {
	return new URL(normalizePathname(pathname), site.url).toString();
}

export function realtorSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "RealEstateAgent",
		"@id": `${site.url}/#realestateagent`,
		name: site.brokerName,
		brand: {
			"@type": "Brand",
			name: site.name,
		},
		legalName: site.companyName,
		url: site.url,
		areaServed: [
			"St. George, Utah",
			"Washington County, Utah",
			"Southern Utah",
		],
		address: {
			"@type": "PostalAddress",
			addressLocality: "St. George",
			addressRegion: "UT",
			addressCountry: "US",
		},
		telephone: site.phone,
		email: site.email,
	};
}

export function webSiteSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${site.url}/#website`,
		name: site.name,
		url: site.url,
		description: site.description,
		publisher: {
			"@id": `${site.url}/#realestateagent`,
		},
		potentialAction: {
			"@type": "SearchAction",
			target: `${site.url}${site.flexmlsSearchUrl}?q={search_term_string}`,
			"query-input": "required name=search_term_string",
		},
	};
}

export function webPageSchema({
	pageTitle,
	description,
	pathname = "/",
}: {
	pageTitle: string;
	description: string;
	pathname?: string;
}) {
	const url = canonical(pathname);

	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		"@id": `${url}#webpage`,
		url,
		name: pageTitle,
		description,
		isPartOf: {
			"@id": `${site.url}/#website`,
		},
		about: {
			"@id": `${site.url}/#realestateagent`,
		},
	};
}

export function breadcrumbSchema(pathname = "/") {
	const normalized = normalizePathname(pathname);
	const parts = normalized.split("/").filter(Boolean);

	const itemListElement = [
		{
			"@type": "ListItem",
			position: 1,
			name: "Home",
			item: `${site.url}/`,
		},
		...parts.map((part, index) => {
			const path = `/${parts.slice(0, index + 1).join("/")}/`;
			const name = part
				.split("-")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");

			return {
				"@type": "ListItem",
				position: index + 2,
				name,
				item: canonical(path),
			};
		}),
	];

	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement,
	};
}
