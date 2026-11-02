# Aalo.com reverse-engineering notes

**Observed:** 16 October 2026 (Australia/Sydney), via the public site in the Codex in-app browser. This documents visible pages and interaction states; it does not validate Aalo's technical or commercial claims.

## Executive summary

Aalo.com is a public corporate/product marketing site for Aalo Atomics. Its narrative links AI/data-center power demand to a factory-manufactured, truck-transportable sodium-cooled reactor platform. The main public paths are Applications, Technology, Factory, Company, Updates, Contact, and Legal. The site is a long-form, image-led marketing experience with scroll sections, featured content sliders, and an update listing with category filters.

## Site map and observed page content

| Route | Purpose and visible content |
|---|---|
| `/` | Brand story, 2023–2029 timeline, data-center nuclear pitch, cost-down thesis, Aalo-1 and Aalo Pod summaries, factory/manufacturing claims, latest content, and contact/careers/invest links. |
| `/applications` | Three market tiers: AI data centers (first market), industrial applications, and broader sustainable abundance. The page associates these with 15¢, 7¢, and 3¢ per kWh claims, respectively. |
| `/technology` | Aalo Pod overview and specifications; sodium, fuel, and safety explanations; prototype-to-production milestone carousel; partner logos and contact CTA. Site-listed specs include a 50 MWe plant with five reactors and shared turbines, sodium coolant, graphite moderator, UO₂ ceramic fuel, 160–425 °C operating temperature, near-atmospheric pressure, and passive decay-heat removal. |
| `/factory` | Factory-led manufacturing thesis, modular shipping/onsite assembly, Austin address, vertical integration, and three factory scale-up phases (40,000, 400,000, and 4,000,000+ sq ft). |
| `/company` | Mission/vision, Austin HQ, leadership and board biographies, progress/fundraising statements, and company values. |
| `/updates` | Featured story carousel, social links, newsletter form, search field, category radios (All, Blog, Press, Video, Podcast), and paginated content cards. |
| `/contact` | Austin headquarters/manufacturing and Idaho Falls office addresses; `mailto:` links for general contact and investment inquiries; careers and press-kit links. No contact submission form appeared in the inspected page. |
| `/legal` | Terms of Use and Privacy Policy, both marked updated July 3, 2026. The page states the website uses Google Analytics and Mailchimp, along with a hosting provider. |

Primary links: [Home](https://www.aalo.com/), [Applications](https://www.aalo.com/applications), [Technology](https://www.aalo.com/technology), [Factory](https://www.aalo.com/factory), [Company](https://www.aalo.com/company), [Updates](https://www.aalo.com/updates), [Contact](https://www.aalo.com/contact), [Legal](https://www.aalo.com/legal).

## Interaction and information architecture

- The header's Menu button expands an overlay containing Home, Applications, Technology, Factory, Company, and Updates.
- The homepage and major pages share a footer with route links, contact/careers/invest links, social links, and an email newsletter field.
- Updates has a featured carousel with clickable story thumbnails. Its category radio controls update the query string (for example, selecting Blog produced `/updates?category_equal=Blog`) and replaces the visible list. Pagination is exposed as a next-page link.
- Technology and Factory expose slide/carousel controls for milestone and factory-scale content.
- The contact page routes general and investment inquiries to email, hiring to an external Rippling careers site, and press assets to a Google Drive folder.

No newsletter subscription, external message, or contact inquiry was submitted.

## Product model presented by the site

- **Aalo-1:** the homepage lists 30 MWt / 10 MWe, sodium thermal, UO₂ ceramic fuel, and transportability by truck.
- **Aalo Pod:** described as five Aalo-1 reactors with multiple turbines and 50 MWe output; the homepage presents a five-reactor/three-turbine configuration.
- **Deployment thesis:** factory-built modules shipped by truck, assembled and commissioned onsite, with staged maintenance intended to preserve fleet availability.
- **Manufacturing thesis:** vertical integration and repeated production reduce cost and schedule uncertainty. The site states a long-term goal of 3¢/kWh and production capacity scaling to gigawatts per year.

These are Aalo's published representations, not independent engineering, regulatory, or economic verification. The site's Legal page explicitly says forward-looking statements about products, capacity, costs, timelines, and plans are not guarantees.

## Implementation signals and confidence

**Observed signals:** image links in the updates listing resolve to `cdn.prod.website-files.com`; forms in the accessibility tree use identifiers such as `wf-form-updates-newsletter`; and the Updates page behaves like a CMS-backed listing with category query parameters and pagination.

**Inference:** these signals are consistent with Webflow-hosted assets/forms and a CMS-driven marketing site. They do not prove the complete hosting, frontend framework, CMS, analytics implementation, or backend architecture. The privacy page itself names Google Analytics and Mailchimp, but this investigation did not inspect network requests or confirm that those scripts execute on every route.

## Evidence boundary and unresolved questions

- Directly observed: public rendered content, accessibility labels, routes, one navigation-menu expansion, and the Blog filter's URL/list update.
- Not established: source code, build system, complete script inventory, runtime request initiators, backend APIs, analytics execution, form submission behavior, or factual accuracy of site claims.
- The REA MCP tools were unavailable in this session, so no REA Evidence IDs, passive runtime capture, or retained analysis record were produced. The browser policy also blocked `view-source:` navigation; no alternate source-access path was attempted.
- This was a focused public-site pass, not a crawl of every post, external destination, responsive breakpoint, or browser state.
